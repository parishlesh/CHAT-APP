// Portfolio-grade E2E demonstration: ECDH P-256 + HKDF + AES-GCM. This is not
// an audited Signal-style protocol: it has no ratchet or session forward secrecy.
// Private JWKs live in localStorage for demo portability; production code should use
// a hardened keystore and device-bound credential protection instead.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const prefix = "e2e:v1:";
const prefixV2 = "e2e:v2:";
let sessionWrapPassword = "";
let encryptionStatus = "idle";
const readyWaiters = [];

const WRAP_SESSION_KEY = "chat-e2e-wrap";

const readStoredWrapSecret = () => {
  try {
    return sessionStorage.getItem(WRAP_SESSION_KEY) || "";
  } catch {
    return "";
  }
};

export const getEncryptionStatus = () => encryptionStatus;
export const isEncryptionReady = () => encryptionStatus === "ready";

export const whenEncryptionReady = () => {
  if (encryptionStatus === "ready") return Promise.resolve();
  return new Promise((resolve) => readyWaiters.push(resolve));
};

const setEncryptionStatus = (status) => {
  encryptionStatus = status;
  if (status === "ready") {
    while (readyWaiters.length) readyWaiters.shift()();
  }
};

export const resetEncryptionStatus = () => {
  encryptionStatus = "idle";
  readyWaiters.length = 0;
};

export const setSessionWrapPassword = (password) => {
  sessionWrapPassword = typeof password === "string" && password ? password : "";
  try {
    if (sessionWrapPassword) sessionStorage.setItem(WRAP_SESSION_KEY, sessionWrapPassword);
    else sessionStorage.removeItem(WRAP_SESSION_KEY);
  } catch {
    /* private browsing */
  }
};

export const clearSessionWrapPassword = () => {
  sessionWrapPassword = "";
  try {
    sessionStorage.removeItem(WRAP_SESSION_KEY);
  } catch {
    /* ignore */
  }
  resetEncryptionStatus();
};

const wrapSecret = (password) => password || sessionWrapPassword || readStoredWrapSecret();

const userIdOf = (user) => {
  if (user == null) return "";
  if (typeof user === "string" || typeof user === "number") return String(user);
  if (user._id != null) return String(user._id);
  if (user.id != null) return String(user.id);
  return "";
};

const toBase64Url = (value) => String(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const toBase64 = (bytes) => {
  const bytesArray = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < bytesArray.length; index += 1) binary += String.fromCharCode(bytesArray[index]);
  return btoa(binary);
};

const fromBase64 = (value) => {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const privateKeyName = (userId) => `chat-e2e-private-${userIdOf(userId)}`;

export const toPublicJwk = (jwk) => {
  let value = jwk;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const { kty, crv, x, y } = value;
  if (kty !== "EC" || !String(crv).replace("-", "").toUpperCase().includes("P256") || typeof x !== "string" || typeof y !== "string") {
    return null;
  }
  return { kty: "EC", crv: "P-256", x: toBase64Url(x), y: toBase64Url(y) };
};

const toPrivateJwk = (jwk) => {
  let value = jwk;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  const publicJwk = toPublicJwk(value);
  if (!publicJwk || typeof value?.d !== "string") return null;
  return { ...publicJwk, d: toBase64Url(value.d), ext: true };
};

const publicKeyFingerprint = (jwk) => {
  const publicJwk = toPublicJwk(jwk);
  return publicJwk ? `${publicJwk.x}.${publicJwk.y}` : "";
};

const isSamePublicKey = (left, right) => {
  const first = publicKeyFingerprint(left);
  const second = publicKeyFingerprint(right);
  return Boolean(first && second && first === second);
};

const parseEncryptedPayload = (text) => {
  if (typeof text !== "string" || !text.startsWith(prefix) || text.startsWith(prefixV2)) {
    return { reason: "INVALID_E2E_VERSION" };
  }
  const body = text.slice(prefix.length).trim();
  const separator = body.indexOf(".");
  if (separator <= 0 || separator === body.length - 1) return { reason: "INVALID_PAYLOAD" };
  const ivPart = body.slice(0, separator);
  const ciphertextPart = body.slice(separator + 1);
  try {
    const iv = fromBase64(ivPart);
    const ciphertext = fromBase64(ciphertextPart);
    if (iv.length !== 12) return { reason: "INVALID_IV" };
    if (!ciphertext.length) return { reason: "INVALID_CIPHERTEXT" };
    return { iv, ciphertext };
  } catch {
    return { reason: "INVALID_PAYLOAD" };
  }
};

const logDecrypt = (reason, extra = {}) => {
  if (!import.meta.env?.DEV) return;
  console.warn("[e2e-decrypt]", { reason, ...extra });
};

const stripBackup = (user) => {
  if (!user || typeof user !== "object") return user;
  const rest = { ...user };
  delete rest.encryptionKeyBackup;
  return rest;
};

const persistLocalIdentity = (userId, privateJwk) => {
  const id = userIdOf(userId);
  const priv = toPrivateJwk(privateJwk);
  const pub = toPublicJwk(priv);
  if (!id || !priv || !pub) throw new Error("invalid identity jwk");
  localStorage.setItem(privateKeyName(id), JSON.stringify(priv));
  localStorage.setItem(`${privateKeyName(id)}-public`, JSON.stringify(pub));
  return { privateJwk: priv, publicJwk: pub };
};

const logIdentity = (source, publicJwk) => {
  if (!import.meta.env?.DEV) return;
  const fingerprint = publicKeyFingerprint(publicJwk);
  console.info("[e2e-identity]", {
    source,
    algorithm: "ECDH-P-256",
    fingerprint: fingerprint ? fingerprint.slice(0, 24) : "",
  });
};

async function importPrivateKey(privateJwk) {
  return crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

async function tryLoadLocalKeyPair(userId) {
  const id = userIdOf(userId);
  const saved = localStorage.getItem(privateKeyName(id));
  if (!saved) return null;
  try {
    const privateJwk = toPrivateJwk(JSON.parse(saved));
    if (!privateJwk) throw new Error("invalid stored private jwk");
    const privateKey = await importPrivateKey(privateJwk);
    const publicJwk = toPublicJwk(JSON.parse(localStorage.getItem(`${privateKeyName(id)}-public`)))
      || toPublicJwk(privateJwk);
    if (!publicJwk) throw new Error("invalid stored public jwk");
    persistLocalIdentity(id, privateJwk);
    return { privateKey, publicJwk, privateJwk };
  } catch (error) {
    logDecrypt("KEY_IMPORT_FAILED", { stage: "local-private" });
    throw error;
  }
}

async function generateLocalIdentity(userId) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const privateJwk = toPrivateJwk(await crypto.subtle.exportKey("jwk", pair.privateKey));
  const persisted = persistLocalIdentity(userId, privateJwk);
  return { privateKey: pair.privateKey, publicJwk: persisted.publicJwk, privateJwk: persisted.privateJwk };
}

async function wrapPrivateJwk(privateJwk, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    encoder.encode(JSON.stringify(privateJwk))
  );
  return { v: 1, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

async function unwrapPrivateJwk(backup, password) {
  if (!backup || backup.v !== 1) throw new Error("invalid backup");
  const salt = fromBase64(backup.salt);
  const iv = fromBase64(backup.iv);
  const ciphertext = fromBase64(backup.ciphertext);
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, ciphertext);
  const privateJwk = toPrivateJwk(JSON.parse(decoder.decode(bytes)));
  if (!privateJwk) throw new Error("invalid unwrapped jwk");
  return privateJwk;
}

async function persistIdentityOnServer(axiosInstance, publicJwk, backup) {
  const { data } = await axiosInstance.put("/auth/encryption-key", {
    encryptionPublicKey: publicJwk,
    ...(backup ? { encryptionKeyBackup: backup } : {}),
  });
  return data;
}

async function aesFromEcdh(privateKey, peerPublicJwk) {
  const publicJwk = toPublicJwk(peerPublicJwk);
  if (!publicJwk) throw new Error("invalid peer key");
  try {
    const peerKey = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, privateKey, 256);
    const material = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("chat-app-e2e-v1"), info: encoder.encode("message-text") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } catch (error) {
    logDecrypt("KEY_DERIVATION_FAILED");
    throw error;
  }
}

async function sharedAesKey(myId, peerPublicJwk) {
  const loaded = await tryLoadLocalKeyPair(myId);
  if (!loaded) throw new Error("missing local identity");
  return aesFromEcdh(loaded.privateKey, peerPublicJwk);
}

async function loadDecryptIdentity(me) {
  const id = userIdOf(me);
  let loaded = null;
  try {
    loaded = await tryLoadLocalKeyPair(id);
  } catch {
    loaded = null;
  }
  if (!loaded) throw new Error("missing local identity");
  const published = toPublicJwk(me?.encryptionPublicKey);
  if (published && !isSamePublicKey(loaded.publicJwk, published)) {
    throw new Error("identity mismatch");
  }
  return loaded;
}

async function encryptAesBlob(aesKey, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoder.encode(text));
  return `${toBase64(iv)}.${toBase64(encrypted)}`;
}

function parseV2Payload(text) {
  const body = text.slice(prefixV2.length).trim();
  const parts = body.split(".");
  if (parts.length !== 4 && parts.length !== 6) return { reason: "INVALID_PAYLOAD" };
  const eph = toPublicJwk({ kty: "EC", crv: "P-256", x: parts[0], y: parts[1] });
  if (!eph) return { reason: "INVALID_PAYLOAD" };
  const blobs = [];
  try {
    for (let index = 2; index < parts.length; index += 2) {
      const iv = fromBase64(parts[index]);
      const ciphertext = fromBase64(parts[index + 1]);
      if (iv.length !== 12 || !ciphertext.length) return { reason: "INVALID_PAYLOAD" };
      blobs.push({ iv, ciphertext });
    }
  } catch {
    return { reason: "INVALID_PAYLOAD" };
  }
  return { eph, blobs };
}

export async function ensureEncryptionKey(user, axiosInstance, password) {
  const id = userIdOf(user);
  if (password) setSessionWrapPassword(password);
  const secret = wrapSecret(password);
  setEncryptionStatus("initializing");
  if (!id || !window.crypto?.subtle) {
    setEncryptionStatus("pending_identity");
    return stripBackup(user);
  }
  const serverPublic = toPublicJwk(user.encryptionPublicKey);
  try {
    let local = null;
    try {
      local = await tryLoadLocalKeyPair(id);
    } catch {
      local = null;
    }

    if (local && serverPublic && !isSamePublicKey(local.publicJwk, serverPublic)) {
      logIdentity("local-mismatch-ignored", serverPublic);
      localStorage.removeItem(privateKeyName(id));
      localStorage.removeItem(`${privateKeyName(id)}-public`);
      local = null;
    }

    if (secret && user.encryptionKeyBackup) {
      try {
        const restored = toPrivateJwk(await unwrapPrivateJwk(user.encryptionKeyBackup, secret));
        const restoredPublic = toPublicJwk(restored);
        if (restoredPublic && (!serverPublic || isSamePublicKey(restoredPublic, serverPublic))) {
          persistLocalIdentity(id, restored);
          local = { publicJwk: restoredPublic, privateJwk: restored, privateKey: await importPrivateKey(restored) };
          logIdentity("restored-backup", restoredPublic);
        }
      } catch {
        logDecrypt("BACKUP_UNWRAP_FAILED");
      }
    }

    if (local && isSamePublicKey(local.publicJwk, serverPublic)) {
      logIdentity("local-match", local.publicJwk);
      if (secret && !user.encryptionKeyBackup) {
        try {
          const backup = await wrapPrivateJwk(local.privateJwk, secret);
          const data = await persistIdentityOnServer(axiosInstance, local.publicJwk, backup);
          setEncryptionStatus("ready");
          return stripBackup({ ...user, ...data, encryptionPublicKey: local.publicJwk });
        } catch {
          logDecrypt("BACKUP_UPLOAD_FAILED");
        }
      }
      setEncryptionStatus("ready");
      return stripBackup({ ...user, encryptionPublicKey: local.publicJwk });
    }

    if (local && !serverPublic) {
      logIdentity("local-first-upload", local.publicJwk);
      const backup = secret ? await wrapPrivateJwk(local.privateJwk, secret) : undefined;
      const data = await persistIdentityOnServer(axiosInstance, local.publicJwk, backup);
      setEncryptionStatus("ready");
      return stripBackup({ ...user, ...data, encryptionPublicKey: local.publicJwk });
    }

    if (serverPublic) {
      setEncryptionStatus("pending_identity");
      return stripBackup({ ...user, encryptionPublicKey: serverPublic });
    }

    const created = await generateLocalIdentity(id);
    logIdentity("generated", created.publicJwk);
    const backup = secret ? await wrapPrivateJwk(created.privateJwk, secret) : undefined;
    const data = await persistIdentityOnServer(axiosInstance, created.publicJwk, backup);
    setEncryptionStatus("ready");
    return stripBackup({ ...user, ...data, encryptionPublicKey: created.publicJwk });
  } catch {
    setEncryptionStatus("pending_identity");
    return stripBackup(user);
  }
}

export async function encryptText(text, me, recipient, options = {}) {
  const recipientPublic = toPublicJwk(recipient?.encryptionPublicKey);
  if (!text || !recipientPublic || !window.crypto?.subtle) return text;
  if (options.version === 1) {
    const id = userIdOf(me);
    let loaded = null;
    try {
      loaded = await tryLoadLocalKeyPair(id);
    } catch {
      loaded = null;
    }
    if (!loaded && !toPublicJwk(me?.encryptionPublicKey)) {
      loaded = await generateLocalIdentity(id);
    }
    if (!loaded) throw new Error("missing local identity");
    const key = await sharedAesKey(id, recipientPublic);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
    return `${prefix}${toBase64(iv)}.${toBase64(encrypted)}`;
  }

  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephPublic = toPublicJwk(await crypto.subtle.exportKey("jwk", eph.publicKey));
  const senderPublic = toPublicJwk(me?.encryptionPublicKey);
  const recipientBlob = await encryptAesBlob(await aesFromEcdh(eph.privateKey, recipientPublic), text);
  const parts = [ephPublic.x, ephPublic.y, recipientBlob];
  if (senderPublic && !isSamePublicKey(senderPublic, recipientPublic)) {
    parts.push(await encryptAesBlob(await aesFromEcdh(eph.privateKey, senderPublic), text));
  }
  if (import.meta.env?.DEV) {
    console.info("[e2e-encrypt]", {
      version: 2,
      algorithm: "ECDH-P-256-ECIES",
      recipientFingerprint: publicKeyFingerprint(recipientPublic).slice(0, 24),
      senderFingerprint: publicKeyFingerprint(senderPublic).slice(0, 24),
    });
  }
  return `${prefixV2}${parts.join(".")}`;
}

export const ENCRYPTED_PREFIX = prefix;
export const isEncryptedText = (text) => typeof text === "string" && (text.startsWith(prefix) || text.startsWith(prefixV2));
export const peerKeyFingerprint = publicKeyFingerprint;

export const resolveConversationPeerKey = (me, conversationPeer, listedPeer) => {
  const myId = userIdOf(me);
  const myPub = me?.encryptionPublicKey;
  const pick = (candidate, candidateUser) => {
    if (candidateUser && userIdOf(candidateUser) && userIdOf(candidateUser) === myId) return null;
    const publicJwk = toPublicJwk(candidate);
    if (!publicJwk || isSamePublicKey(publicJwk, myPub)) return null;
    return publicJwk;
  };
  return pick(conversationPeer?.encryptionPublicKey, conversationPeer)
    || pick(listedPeer?.encryptionPublicKey, listedPeer)
    || null;
};

export async function decryptMessage(text, me, peer) {
  if (!text) return { status: "decrypted", text: "", reason: null };
  if (!isEncryptedText(text)) return { status: "decrypted", text, reason: null };
  if (!window.crypto?.subtle) {
    logDecrypt("CRYPTO_UNAVAILABLE");
    return { status: "failed", text: "Unable to decrypt this message", reason: "CRYPTO_UNAVAILABLE" };
  }
  const myId = userIdOf(me);
  if (!myId) {
    logDecrypt("NO_LOCAL_USER");
    return { status: "pending", text: "", reason: "NO_LOCAL_USER" };
  }
  if (encryptionStatus === "idle" || encryptionStatus === "initializing") {
    logDecrypt("NOT_READY");
    return { status: "pending", text: "", reason: "NOT_READY" };
  }

  const failFromError = (error) => {
    const message = String(error?.message || "");
    if (message.includes("missing local identity")) {
      logDecrypt("NO_LOCAL_KEY");
      return { status: "pending", text: "", reason: "NO_LOCAL_KEY" };
    }
    if (message.includes("identity mismatch")) {
      logDecrypt("IDENTITY_MISMATCH");
      return { status: "pending", text: "", reason: "IDENTITY_MISMATCH" };
    }
    const reason = message.includes("invalid peer") ? "INVALID_PEER_KEY" : "CRYPTO_DECRYPT_FAILED";
    logDecrypt(reason, {
      version: text.startsWith(prefixV2) ? 2 : 1,
      localFingerprint: peerKeyFingerprint(me?.encryptionPublicKey).slice(0, 24),
      peerFingerprint: peerKeyFingerprint(peer?.encryptionPublicKey).slice(0, 24),
    });
    return { status: "failed", text: "Unable to decrypt this message", reason };
  };

  if (text.startsWith(prefixV2)) {
    const parsed = parseV2Payload(text);
    if (parsed.reason) {
      logDecrypt(parsed.reason);
      return { status: "failed", text: "Unable to decrypt this message", reason: parsed.reason };
    }
    try {
      const identity = await loadDecryptIdentity(me);
      for (const blob of parsed.blobs) {
        try {
          const key = await aesFromEcdh(identity.privateKey, parsed.eph);
          const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.iv }, key, blob.ciphertext);
          return { status: "decrypted", text: decoder.decode(decrypted), reason: null };
        } catch {
          /* try next envelope copy */
        }
      }
      logDecrypt("CRYPTO_DECRYPT_FAILED", { version: 2, localFingerprint: publicKeyFingerprint(identity.publicJwk).slice(0, 24) });
      return { status: "failed", text: "Unable to decrypt this message", reason: "CRYPTO_DECRYPT_FAILED" };
    } catch (error) {
      return failFromError(error);
    }
  }

  const peerPublic = toPublicJwk(peer?.encryptionPublicKey);
  if (!peerPublic) {
    logDecrypt("NO_PEER_KEY");
    return { status: "pending", text: "", reason: "NO_PEER_KEY" };
  }
  if (isSamePublicKey(peerPublic, me?.encryptionPublicKey)) {
    logDecrypt("INVALID_PEER_KEY", { detail: "own-key" });
    return { status: "pending", text: "", reason: "INVALID_PEER_KEY" };
  }
  const parsed = parseEncryptedPayload(text);
  if (parsed.reason) {
    logDecrypt(parsed.reason);
    return { status: "failed", text: "Unable to decrypt this message", reason: parsed.reason };
  }
  try {
    await loadDecryptIdentity(me);
    const key = await sharedAesKey(myId, peerPublic);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: parsed.iv }, key, parsed.ciphertext);
    return { status: "decrypted", text: decoder.decode(decrypted), reason: null };
  } catch (error) {
    return failFromError(error);
  }
}

export async function decryptText(text, me, peer) {
  const result = await decryptMessage(text, me, peer);
  return result.status === "pending" ? "" : result.text;
}
