// Portfolio-grade E2E demonstration: ECDH P-256 + HKDF + AES-GCM. This is not
// an audited Signal-style protocol: it has no ratchet or session forward secrecy.
// Private JWKs live in localStorage for demo portability; production code should use
// a hardened keystore and device-bound credential protection instead.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const prefix = "e2e:v1:";

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
  if (!isEncryptedText(text)) return { reason: "INVALID_E2E_VERSION" };
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

async function sharedAesKey(myId, peerPublicJwk) {
  const publicJwk = toPublicJwk(peerPublicJwk);
  if (!publicJwk) throw new Error("invalid peer key");
  const loaded = await tryLoadLocalKeyPair(myId);
  if (!loaded) throw new Error("missing local identity");
  try {
    const peerKey = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, loaded.privateKey, 256);
    const material = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("chat-app-e2e-v1"), info: encoder.encode("message-text") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } catch (error) {
    logDecrypt("KEY_DERIVATION_FAILED");
    throw error;
  }
}

export async function ensureEncryptionKey(user, axiosInstance, password) {
  const id = userIdOf(user);
  if (!id || !window.crypto?.subtle) return stripBackup(user);
  const serverPublic = toPublicJwk(user.encryptionPublicKey);
  try {
    let local = null;
    try {
      local = await tryLoadLocalKeyPair(id);
    } catch {
      local = null;
    }

    if (password && user.encryptionKeyBackup) {
      try {
        const restored = toPrivateJwk(await unwrapPrivateJwk(user.encryptionKeyBackup, password));
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
      if (password && !user.encryptionKeyBackup) {
        try {
          const backup = await wrapPrivateJwk(local.privateJwk, password);
          const data = await persistIdentityOnServer(axiosInstance, local.publicJwk, backup);
          return stripBackup({ ...user, ...data, encryptionPublicKey: local.publicJwk });
        } catch {
          /* backup upload is optional for this session */
        }
      }
      return stripBackup({ ...user, encryptionPublicKey: local.publicJwk });
    }

    if (serverPublic) {
      if (local && !isSamePublicKey(local.publicJwk, serverPublic)) {
        logIdentity("local-mismatch-kept-server", serverPublic);
      }
      return stripBackup({ ...user, encryptionPublicKey: serverPublic });
    }

    const created = local || await generateLocalIdentity(id);
    logIdentity(local ? "local-first-upload" : "generated", created.publicJwk);
    const backup = password ? await wrapPrivateJwk(created.privateJwk, password) : undefined;
    const data = await persistIdentityOnServer(axiosInstance, created.publicJwk, backup);
    return stripBackup({ ...user, ...data, encryptionPublicKey: created.publicJwk });
  } catch {
    return stripBackup(user);
  }
}

export async function encryptText(text, me, recipient) {
  if (!text || !toPublicJwk(recipient?.encryptionPublicKey) || !window.crypto?.subtle) return text;
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
  const key = await sharedAesKey(id, recipient.encryptionPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
  return `${prefix}${toBase64(iv)}.${toBase64(encrypted)}`;
}

export const ENCRYPTED_PREFIX = prefix;
export const isEncryptedText = (text) => typeof text === "string" && text.startsWith(prefix);
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
    const key = await sharedAesKey(myId, peerPublic);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: parsed.iv }, key, parsed.ciphertext);
    return { status: "decrypted", text: decoder.decode(decrypted), reason: null };
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("missing local identity")) {
      logDecrypt("NO_LOCAL_KEY");
      return { status: "pending", text: "", reason: "NO_LOCAL_KEY" };
    }
    const reason = message.includes("invalid peer") ? "INVALID_PEER_KEY" : "CRYPTO_DECRYPT_FAILED";
    logDecrypt(reason);
    return { status: "failed", text: "Unable to decrypt this message", reason };
  }
}

export async function decryptText(text, me, peer) {
  const result = await decryptMessage(text, me, peer);
  return result.status === "pending" ? "" : result.text;
}
