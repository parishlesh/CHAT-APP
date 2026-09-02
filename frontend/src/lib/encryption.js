// VibeLink E2E: one user encryption identity, ECDH P-256 + HKDF + AES-GCM.
// Server stores ciphertext, public keys, and password-wrapped private-key backups only.
import {
  PREFIX_V1,
  PREFIX_V2,
  PREFIX_V3,
  fromBase64,
  isEncryptedText,
  isSamePublicKey,
  payloadVersion,
  publicKeyFingerprint,
  publicKeyId,
  sha256Hex,
  toBase64,
  toPrivateJwk,
  toPublicJwk,
  userIdOf,
} from "./e2e/codec.js";
import {
  cacheEncryptedMessages,
  clearStoredIdentity as clearStoredIdentityRecord,
  hasStoredPrivateKey as hasStoredPrivateKeyRecord,
  persistLocalIdentityRecord,
  readCachedMessages,
  readLegacyPrivate,
  readWrappedIdentity,
  listLocalWrappedRecords,
  unwrapProtectedRecord,
} from "./e2e/keystore.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HKDF_SALT = encoder.encode("chat-app-e2e-v1");
const HKDF_INFO = encoder.encode("message-text");
const WRAP_SESSION_KEY = "chat-e2e-wrap";

let sessionWrapPassword = "";
let encryptionStatus = "uninitialized";
let encryptionFailure = null;
const readyWaiters = [];
const identityCache = new Map();
let initLock = Promise.resolve();
let activeUserId = "";

export const getEncryptionStatus = () => encryptionStatus;
export const getEncryptionFailure = () => encryptionFailure;
export const isEncryptionReady = () => encryptionStatus === "ready";
export const isEncryptionInitialized = () => (
  encryptionStatus === "ready"
  || encryptionStatus === "unavailable"
  || encryptionStatus === "mismatch"
  || encryptionStatus === "locked"
);

export const whenEncryptionReady = () => {
  if (isEncryptionInitialized()) return Promise.resolve();
  return new Promise((resolve) => readyWaiters.push(resolve));
};

export const waitForEncryptionInit = async () => {
  if (isEncryptionInitialized()) return;
  return whenEncryptionReady();
};

const setEncryptionStatus = (status, failure = null) => {
  encryptionStatus = status;
  encryptionFailure = failure;
  if (isEncryptionInitialized()) {
    while (readyWaiters.length) readyWaiters.shift()();
  }
};

export const resetEncryptionStatus = () => {
  encryptionStatus = "uninitialized";
  encryptionFailure = null;
};

const clearIdentityCache = () => identityCache.clear();

const readStoredWrapSecret = () => {
  try {
    return sessionStorage.getItem(WRAP_SESSION_KEY) || "";
  } catch {
    return "";
  }
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
  activeUserId = "";
  try {
    sessionStorage.removeItem(WRAP_SESSION_KEY);
  } catch {
    /* ignore */
  }
  clearIdentityCache();
  resetEncryptionStatus();
};

const wrapSecret = (password) => password || sessionWrapPassword || readStoredWrapSecret();
export const hasUnlockSecret = () => Boolean(wrapSecret());

const stripBackup = (user) => {
  if (!user || typeof user !== "object") return user;
  const rest = { ...user };
  delete rest.encryptionKeyBackup;
  return rest;
};

const logDecrypt = (reason, extra = {}) => {
  if (!import.meta.env?.DEV) return;
  const safe = { ...extra };
  delete safe.privateKey;
  delete safe.d;
  delete safe.password;
  delete safe.wrapSecret;
  console.warn("[e2e-decrypt]", { reason, encryptionStatus, encryptionFailure, ...safe });
};

const logIdentity = (source, publicJwk, extra = {}) => {
  if (!import.meta.env?.DEV) return;
  publicKeyId(publicJwk).then((keyId) => {
    console.info("[e2e-identity]", {
      source,
      algorithm: "ECDH-P-256",
      keyId: keyId.slice(0, 16),
      encryptionStatus,
      ...extra,
    });
  }).catch(() => {});
};

async function importPrivateKey(privateJwk) {
  return crypto.subtle.importKey("jwk", toPrivateJwk(privateJwk), { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
}

export async function verifyKeyIdentity(privateKey, expectedPublic) {
  const exported = toPublicJwk(await crypto.subtle.exportKey("jwk", privateKey));
  if (!exported) throw new Error("E2E_IDENTITY_MISMATCH");
  if (expectedPublic && !isSamePublicKey(exported, expectedPublic)) throw new Error("E2E_IDENTITY_MISMATCH");
  return exported;
}

async function identityFromPrivateJwk(privateJwk, expectedPublic) {
  const priv = toPrivateJwk(privateJwk);
  if (!priv) throw new Error("invalid stored private jwk");
  const privateKey = await importPrivateKey(priv);
  const publicJwk = await verifyKeyIdentity(privateKey, expectedPublic || toPublicJwk(priv));
  const keyId = await publicKeyId(publicJwk);
  return { privateKey, publicJwk, privateJwk: { ...publicJwk, d: priv.d, ext: true }, keyId };
}

async function persistLocalIdentity(userId, privateJwk) {
  const id = userIdOf(userId);
  const identity = await identityFromPrivateJwk(privateJwk);
  await persistLocalIdentityRecord(id, identity.privateJwk, identity.publicJwk, identity.keyId);
  identityCache.set(id, identity);
  return identity;
}

const clearStoredIdentity = async (userId) => {
  const id = userIdOf(userId);
  identityCache.delete(id);
  await clearStoredIdentityRecord(id);
};

async function recoverMatchingLocalIdentity(userId, expectedPublic) {
  if (!expectedPublic) return null;
  const records = await listLocalWrappedRecords();
  for (const record of records) {
    try {
      const privateJwk = await unwrapProtectedRecord(record.wrapped);
      if (!privateJwk) continue;
      const identity = await identityFromPrivateJwk(privateJwk);
      if (!isSamePublicKey(identity.publicJwk, expectedPublic)) continue;
      logIdentity("recovered-local", identity.publicJwk, { scanned: record.userId !== userId });
      return persistLocalIdentity(userId, identity.privateJwk);
    } catch {
      /* try next protected copy */
    }
  }
  return null;
}

async function tryLoadLocalKeyPair(userId) {
  const id = userIdOf(userId);
  const cached = identityCache.get(id);
  if (cached) return cached;
  try {
    const wrapped = await readWrappedIdentity(id);
    if (wrapped) {
      const identity = await identityFromPrivateJwk(wrapped);
      identityCache.set(id, identity);
      return identity;
    }
  } catch {
    logDecrypt("KEY_UNWRAP_FAILED", { stage: "device-wrap" });
  }
  const legacy = readLegacyPrivate(id);
  if (!legacy) return null;
  try {
    return persistLocalIdentity(id, legacy);
  } catch (error) {
    logDecrypt("KEY_IMPORT_FAILED", { stage: "local-private" });
    throw error;
  }
}

const usableBackup = (backup) => {
  if (!backup || typeof backup !== "object") return null;
  const v = Number(backup.v);
  if (v !== 1 || typeof backup.salt !== "string" || typeof backup.iv !== "string" || typeof backup.ciphertext !== "string") {
    return null;
  }
  return { v: 1, salt: backup.salt, iv: backup.iv, ciphertext: backup.ciphertext };
};

async function fetchServerIdentity(user, axiosInstance) {
  if (!axiosInstance?.get) return user;
  try {
    const { data } = await axiosInstance.get("/auth/encryption-key");
    if (import.meta.env?.DEV) {
      console.info("[e2e-identity]", {
        source: "server-record",
        hasPublicKey: Boolean(data?.hasPublicKey ?? data?.encryptionPublicKey),
        hasWrappedBackup: Boolean(data?.hasWrappedBackup ?? usableBackup(data?.encryptionKeyBackup)),
        backupLength: data?.backupLength || data?.encryptionKeyBackup?.ciphertext?.length || 0,
        keyId: data?.keyId || "",
      });
    }
    return {
      ...user,
      encryptionPublicKey: data?.encryptionPublicKey || user.encryptionPublicKey,
      encryptionKeyBackup: usableBackup(data?.encryptionKeyBackup) || usableBackup(user.encryptionKeyBackup),
    };
  } catch {
    return {
      ...user,
      encryptionKeyBackup: usableBackup(user.encryptionKeyBackup),
    };
  }
}

async function generateInMemoryIdentity() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const privateJwk = toPrivateJwk(await crypto.subtle.exportKey("jwk", pair.privateKey));
  const publicJwk = toPublicJwk(privateJwk);
  return { privateKey: pair.privateKey, publicJwk, privateJwk, keyId: await publicKeyId(publicJwk) };
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
  const usable = usableBackup(backup);
  if (!usable) throw new Error("invalid backup");
  const salt = fromBase64(usable.salt);
  const iv = fromBase64(usable.iv);
  const ciphertext = fromBase64(usable.ciphertext);
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
  try {
    const { data } = await axiosInstance.put("/auth/encryption-key", {
      encryptionPublicKey: publicJwk,
      ...(backup ? { encryptionKeyBackup: backup } : {}),
    });
    return { accepted: true, data };
  } catch (error) {
    if (error?.response?.status === 409) {
      return { accepted: false, conflict: true, data: error.response.data || {} };
    }
    throw error;
  }
}

async function aesFromEcdh(privateKey, peerPublicJwk) {
  const publicJwk = toPublicJwk(peerPublicJwk);
  if (!publicJwk) throw new Error("invalid peer key");
  try {
    const peerKey = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, privateKey, 256);
    const material = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    logDecrypt("KEY_DERIVATION_FAILED");
    throw error;
  }
}

async function loadLocalIdentity(me) {
  const id = userIdOf(me);
  let loaded = null;
  try {
    loaded = await tryLoadLocalKeyPair(id);
  } catch {
    loaded = null;
  }
  if (!loaded) throw new Error("missing local identity");
  return loaded;
}

async function loadDecryptIdentity(me) {
  const loaded = await loadLocalIdentity(me);
  const published = toPublicJwk(me?.encryptionPublicKey);
  if (published && !isSamePublicKey(loaded.publicJwk, published)) {
    throw new Error("E2E_IDENTITY_MISMATCH");
  }
  return loaded;
}

export async function getEncryptionIdentity(me) {
  return loadDecryptIdentity(me || { _id: activeUserId });
}

export async function getCurrentPrivateKey(me) {
  const identity = await loadDecryptIdentity(me);
  return identity.privateKey;
}

export async function getPublicKey(me) {
  const identity = await loadDecryptIdentity(me);
  return identity.publicJwk;
}

export async function getKeyId(me) {
  const identity = await loadDecryptIdentity(me);
  return identity.keyId;
}

export async function preparePasswordChangeBackup(user, newPassword) {
  const id = userIdOf(user);
  if (import.meta.env?.DEV) {
    console.info("[e2e-identity]", {
      source: "password-change-started",
      hasUser: Boolean(id),
    });
  }
  if (!id || !newPassword) return { available: false };
  let local = null;
  try {
    local = await tryLoadLocalKeyPair(id);
  } catch {
    local = null;
  }
  if (!local) {
    const expected = toPublicJwk(user?.encryptionPublicKey);
    if (expected) local = await recoverMatchingLocalIdentity(id, expected);
  }
  if (!local) {
    if (import.meta.env?.DEV) {
      console.info("[e2e-identity]", { source: "password-change", e2eIdentityAvailable: false });
    }
    return { available: false };
  }
  if (import.meta.env?.DEV) {
    console.info("[e2e-identity]", {
      source: "password-change-rewrap-started",
      keyId: local.keyId.slice(0, 16),
    });
  }
  const backup = await wrapPrivateJwk(local.privateJwk, newPassword);
  const restored = toPrivateJwk(await unwrapPrivateJwk(backup, newPassword));
  if (!restored || !isSamePublicKey(toPublicJwk(restored), local.publicJwk)) {
    throw new Error("BACKUP_REWRAP_FAILED");
  }
  if (import.meta.env?.DEV) {
    console.info("[e2e-identity]", {
      source: "password-change-rewrap-succeeded",
      keyId: local.keyId.slice(0, 16),
    });
  }
  return {
    available: true,
    encryptionPublicKey: local.publicJwk,
    encryptionKeyBackup: backup,
    keyId: local.keyId,
  };
}

async function encryptAesBlob(aesKey, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoder.encode(text));
  return { iv: toBase64(iv), ciphertext: toBase64(encrypted), packed: `${toBase64(iv)}.${toBase64(encrypted)}` };
}

function parseV1Payload(text) {
  const body = text.slice(PREFIX_V1.length).trim();
  const separator = body.indexOf(".");
  if (separator <= 0 || separator === body.length - 1) return { reason: "INVALID_CIPHERTEXT" };
  try {
    const iv = fromBase64(body.slice(0, separator));
    const ciphertext = fromBase64(body.slice(separator + 1));
    if (iv.length !== 12 || !ciphertext.length) return { reason: "INVALID_CIPHERTEXT" };
    return { iv, ciphertext };
  } catch {
    return { reason: "INVALID_CIPHERTEXT" };
  }
}

function parseV2Payload(text) {
  const body = text.slice(PREFIX_V2.length).trim();
  const parts = body.split(".");
  if (parts.length !== 4 && parts.length !== 6) return { reason: "INVALID_CIPHERTEXT" };
  const eph = toPublicJwk({ kty: "EC", crv: "P-256", x: parts[0], y: parts[1] });
  if (!eph) return { reason: "INVALID_CIPHERTEXT" };
  const blobs = [];
  try {
    for (let index = 2; index < parts.length; index += 2) {
      const iv = fromBase64(parts[index]);
      const ciphertext = fromBase64(parts[index + 1]);
      if (iv.length !== 12 || !ciphertext.length) return { reason: "INVALID_CIPHERTEXT" };
      blobs.push({ iv, ciphertext });
    }
  } catch {
    return { reason: "INVALID_CIPHERTEXT" };
  }
  return { eph, blobs };
}

function parseV3Payload(text) {
  try {
    const parsed = JSON.parse(decoder.decode(fromBase64(text.slice(PREFIX_V3.length).trim())));
    if (parsed?.v !== 3 || parsed?.algorithm !== "ECDH-P-256-HKDF-SHA256-AES-GCM") {
      return { reason: "UNKNOWN_CIPHERTEXT_VERSION" };
    }
    const eph = toPublicJwk(parsed.ephemeralPublicKey);
    if (!eph) return { reason: "MISSING_EPHEMERAL_KEY" };
    if (!Array.isArray(parsed.copies) || !parsed.copies.length) return { reason: "INVALID_CIPHERTEXT" };
    const blobs = [];
    for (const copy of parsed.copies) {
      if (typeof copy?.iv !== "string" || typeof copy?.ciphertext !== "string") return { reason: "INVALID_CIPHERTEXT" };
      const iv = fromBase64(copy.iv);
      const ciphertext = fromBase64(copy.ciphertext);
      if (iv.length !== 12 || !ciphertext.length) return { reason: "INVALID_CIPHERTEXT" };
      blobs.push({ iv, ciphertext });
    }
    return { eph, blobs, keyId: parsed.keyId || "" };
  } catch {
    return { reason: "INVALID_CIPHERTEXT" };
  }
}

async function restoreFromBackup(userId, backup, secret, serverPublic) {
  if (!secret || !backup) return null;
  try {
    const restored = toPrivateJwk(await unwrapPrivateJwk(backup, secret));
    const restoredPublic = toPublicJwk(restored);
    if (!restoredPublic) return null;
    if (serverPublic && !isSamePublicKey(restoredPublic, serverPublic)) {
      logDecrypt("E2E_IDENTITY_MISMATCH", { stage: "backup" });
      return null;
    }
    const identity = await persistLocalIdentity(userId, restored);
    logIdentity("restored-backup", identity.publicJwk);
    return identity;
  } catch {
    logDecrypt("KEY_UNWRAP_FAILED", { stage: "server-backup" });
    return null;
  }
}

async function adoptServerIdentity(user, secret) {
  const serverPublic = toPublicJwk(user.encryptionPublicKey);
  await clearStoredIdentity(userIdOf(user));
  return restoreFromBackup(userIdOf(user), user.encryptionKeyBackup, secret, serverPublic);
}

async function ensureEncryptionKeyImpl(user, axiosInstance, password) {
  const id = userIdOf(user);
  if (password) setSessionWrapPassword(password);
  const secret = wrapSecret(password);
  activeUserId = id;
  setEncryptionStatus("initializing");
  if (!id || !window.crypto?.subtle) {
    setEncryptionStatus("unavailable", "CRYPTO_UNAVAILABLE");
    return stripBackup(user);
  }
  const record = await fetchServerIdentity(user, axiosInstance);
  const serverPublic = toPublicJwk(record.encryptionPublicKey);
  const serverBackup = usableBackup(record.encryptionKeyBackup);
  if (import.meta.env?.DEV) {
    console.info("[e2e-identity]", {
      source: "init",
      hasServerPublic: Boolean(serverPublic),
      hasBackup: Boolean(serverBackup),
      hasUnlockSecret: Boolean(secret),
      encryptionStatus: "initializing",
    });
  }
  try {
    let local = null;
    try {
      local = await tryLoadLocalKeyPair(id);
    } catch {
      logDecrypt("KEY_UNWRAP_FAILED", { stage: "local-load" });
      local = null;
    }
    if (!local && serverPublic) {
      local = await recoverMatchingLocalIdentity(id, serverPublic);
    }

    if (local && serverPublic && !isSamePublicKey(local.publicJwk, serverPublic)) {
      logIdentity("local-mismatch", serverPublic);
      logDecrypt("E2E_IDENTITY_MISMATCH", { stage: "local-vs-server" });
      await clearStoredIdentity(id);
      local = null;
      if (secret && serverBackup) {
        local = await restoreFromBackup(id, serverBackup, secret, serverPublic);
      }
      if (!local) {
        setEncryptionStatus("mismatch", "E2E_IDENTITY_MISMATCH");
        return stripBackup({ ...record, encryptionPublicKey: serverPublic });
      }
    }

    if (!local && secret && serverBackup) {
      local = await restoreFromBackup(id, serverBackup, secret, serverPublic);
    }

    if (local && isSamePublicKey(local.publicJwk, serverPublic)) {
      logIdentity("local-match", local.publicJwk);
      if (secret && !serverBackup) {
        try {
          const backup = await wrapPrivateJwk(local.privateJwk, secret);
          const result = await persistIdentityOnServer(axiosInstance, local.publicJwk, backup);
          if (result.accepted) {
            setEncryptionStatus("ready");
            return stripBackup({ ...record, ...result.data, encryptionPublicKey: local.publicJwk });
          }
        } catch {
          logDecrypt("BACKUP_UPLOAD_FAILED");
        }
      }
      setEncryptionStatus("ready");
      return stripBackup({ ...record, encryptionPublicKey: local.publicJwk });
    }

    if (local && !serverPublic) {
      logIdentity("local-first-upload", local.publicJwk);
      if (!secret) {
        setEncryptionStatus("ready");
        logIdentity("local-ready-backup-pending", local.publicJwk);
        return stripBackup({ ...record, encryptionPublicKey: local.publicJwk });
      }
      const backup = await wrapPrivateJwk(local.privateJwk, secret);
      const result = await persistIdentityOnServer(axiosInstance, local.publicJwk, backup);
      if (result.conflict) {
        const canonical = { ...record, ...result.data };
        const adopted = await adoptServerIdentity(canonical, secret);
        if (adopted) {
          setEncryptionStatus("ready");
          return stripBackup({ ...canonical, encryptionPublicKey: adopted.publicJwk });
        }
        setEncryptionStatus("mismatch", "E2E_IDENTITY_MISMATCH");
        return stripBackup({ ...canonical, encryptionPublicKey: toPublicJwk(canonical.encryptionPublicKey) || local.publicJwk });
      }
      setEncryptionStatus("ready");
      return stripBackup({ ...record, ...result.data, encryptionPublicKey: local.publicJwk });
    }

    if (serverPublic) {
      const reason = serverBackup
        ? (secret ? "BACKUP_UNWRAP_FAILED" : "KEY_NOT_RESTORED")
        : "KEY_BACKUP_REQUIRED";
      setEncryptionStatus("locked", reason);
      logIdentity("missing-local-private", serverPublic, {
        hasBackup: Boolean(serverBackup),
        reason,
        hasUnlockSecret: Boolean(secret),
        localIdentityFound: false,
      });
      return stripBackup({ ...record, encryptionPublicKey: serverPublic });
    }

    if (!secret) {
      setEncryptionStatus("locked", "NO_SERVER_IDENTITY");
      return stripBackup(record);
    }

    const created = await generateInMemoryIdentity();
    logIdentity("generated", created.publicJwk);
    const backup = await wrapPrivateJwk(created.privateJwk, secret);
    const result = await persistIdentityOnServer(axiosInstance, created.publicJwk, backup);
    if (result.conflict) {
      const canonical = { ...record, ...result.data };
      const adopted = await adoptServerIdentity(canonical, secret);
      if (adopted) {
        setEncryptionStatus("ready");
        return stripBackup({ ...canonical, encryptionPublicKey: adopted.publicJwk });
      }
      setEncryptionStatus("mismatch", "E2E_IDENTITY_MISMATCH");
      return stripBackup({ ...canonical, encryptionPublicKey: toPublicJwk(canonical.encryptionPublicKey) });
    }
    await persistLocalIdentity(id, created.privateJwk);
    setEncryptionStatus("ready");
    return stripBackup({ ...record, ...result.data, encryptionPublicKey: created.publicJwk });
  } catch {
    setEncryptionStatus("unavailable", "INIT_FAILED");
    return stripBackup(record);
  }
}

export async function initializeEncryptionIdentity(user, axiosInstance, password) {
  const run = initLock.then(() => ensureEncryptionKeyImpl(user, axiosInstance, password));
  initLock = run.then(() => undefined, () => undefined);
  return run;
}

export async function restoreEncryptionIdentity(user, axiosInstance, password) {
  return initializeEncryptionIdentity(user, axiosInstance, password);
}

export async function ensureEncryptionKey(user, axiosInstance, password) {
  return initializeEncryptionIdentity(user, axiosInstance, password);
}

async function resetUnrecoverableEncryptionIdentityImpl(user, axiosInstance, password) {
  if (getEncryptionFailure() !== "KEY_BACKUP_REQUIRED") {
    throw new Error("RESET_NOT_ALLOWED");
  }
  const secret = wrapSecret(password);
  if (!secret) throw new Error("PASSWORD_REQUIRED");
  const record = await fetchServerIdentity(user, axiosInstance);
  if (usableBackup(record.encryptionKeyBackup)) {
    throw new Error("RESET_NOT_ALLOWED");
  }
  const created = await generateInMemoryIdentity();
  const backup = await wrapPrivateJwk(created.privateJwk, secret);
  const { data } = await axiosInstance.post("/auth/encryption-key/reset", {
    encryptionPublicKey: created.publicJwk,
    encryptionKeyBackup: backup,
  });
  await persistLocalIdentity(userIdOf(user), created.privateJwk);
  setEncryptionStatus("ready");
  logIdentity("explicit-reset", created.publicJwk, {
    previousHadPublicKey: Boolean(toPublicJwk(record.encryptionPublicKey)),
  });
  return stripBackup({ ...user, ...data, encryptionPublicKey: created.publicJwk });
}

export async function resetUnrecoverableEncryptionIdentity(user, axiosInstance, password) {
  const run = initLock.then(() => resetUnrecoverableEncryptionIdentityImpl(user, axiosInstance, password));
  initLock = run.then(() => undefined, () => undefined);
  return run;
}

async function encryptCopies(plaintext, recipientPublic, senderPublic) {
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephPublic = toPublicJwk(await crypto.subtle.exportKey("jwk", eph.publicKey));
  const copies = [await encryptAesBlob(await aesFromEcdh(eph.privateKey, recipientPublic), plaintext)];
  if (senderPublic && !isSamePublicKey(senderPublic, recipientPublic)) {
    copies.push(await encryptAesBlob(await aesFromEcdh(eph.privateKey, senderPublic), plaintext));
  }
  return { ephPublic, copies };
}

export async function encryptMessage(text, me, recipient, options = {}) {
  if (!text) return "";
  const recipientPublic = toPublicJwk(recipient?.encryptionPublicKey);
  if (!window.crypto?.subtle) throw new Error("CRYPTO_UNAVAILABLE");
  if (!recipientPublic) throw new Error("NO_PEER_KEY");
  if (getEncryptionStatus() === "uninitialized") throw new Error("ENCRYPTION_NOT_READY");
  await waitForEncryptionInit();
  if (!isEncryptionReady()) throw new Error(encryptionFailure || "ENCRYPTION_NOT_READY");
  const identity = await loadLocalIdentity(me);
  const version = options.version || 3;

  if (version === 1) {
    const key = await aesFromEcdh(identity.privateKey, recipientPublic);
    const blob = await encryptAesBlob(key, text);
    return `${PREFIX_V1}${blob.packed}`;
  }

  const { ephPublic, copies } = await encryptCopies(text, recipientPublic, identity.publicJwk);
  if (import.meta.env?.DEV) {
    console.info("[e2e-encrypt]", {
      version,
      algorithm: "ECDH-P-256-ECIES",
      recipientKeyId: (await publicKeyId(recipientPublic)).slice(0, 16),
      senderKeyId: identity.keyId.slice(0, 16),
    });
  }
  if (version === 2) {
    return `${PREFIX_V2}${[ephPublic.x, ephPublic.y, ...copies.map((copy) => copy.packed)].join(".")}`;
  }
  const envelope = {
    v: 3,
    algorithm: "ECDH-P-256-HKDF-SHA256-AES-GCM",
    keyId: await publicKeyId(recipientPublic),
    ephemeralPublicKey: ephPublic,
    copies: copies.map((copy) => ({ iv: copy.iv, ciphertext: copy.ciphertext })),
  };
  return `${PREFIX_V3}${toBase64(encoder.encode(JSON.stringify(envelope)))}`;
}

export async function encryptText(text, me, recipient, options = {}) {
  return encryptMessage(text, me, recipient, options);
}

export const ENCRYPTED_PREFIX = PREFIX_V1;
export { isEncryptedText, toPublicJwk, publicKeyFingerprint as peerKeyFingerprint, cacheEncryptedMessages, readCachedMessages };

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

async function decryptCopies(blobs, privateKey, eph) {
  let lastError = null;
  for (const blob of blobs) {
    try {
      const key = await aesFromEcdh(privateKey, eph);
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.iv }, key, blob.ciphertext);
      return decoder.decode(decrypted);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("AUTH_TAG_FAILURE");
}

const diagnosticContext = async (me, peer, text, extra = {}) => ({
  version: payloadVersion(text),
  localKeyId: (await publicKeyId(me?.encryptionPublicKey)).slice(0, 16),
  peerKeyId: (await publicKeyId(peer?.encryptionPublicKey)).slice(0, 16),
  encryptionStatus,
  encryptionFailure,
  ...extra,
});

export async function decryptMessage(text, me, peer, meta = {}) {
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
  await waitForEncryptionInit();
  if (encryptionStatus === "uninitialized" || encryptionStatus === "initializing") {
    logDecrypt("ENCRYPTION_NOT_INITIALIZED");
    return { status: "pending", text: "", reason: "ENCRYPTION_NOT_INITIALIZED" };
  }
  if (encryptionStatus !== "ready") {
    const reason = encryptionFailure || (encryptionStatus === "mismatch" ? "E2E_IDENTITY_MISMATCH" : "KEY_NOT_RESTORED");
    logDecrypt(reason, await diagnosticContext(me, peer, text, {
      messageId: meta.messageId || "",
      senderId: meta.senderId || "",
      recipientId: meta.recipientId || "",
      stage: "identity",
    }));
    return { status: "failed", text: "Unable to decrypt this message", reason };
  }

  const failFromError = async (error) => {
    const message = String(error?.message || "");
    const reason = message.includes("E2E_IDENTITY_MISMATCH") || message.includes("identity mismatch")
      ? "E2E_IDENTITY_MISMATCH"
      : message.includes("missing local identity")
        ? "KEY_NOT_RESTORED"
        : message.includes("invalid peer")
          ? "INVALID_PEER_KEY"
          : "AES_GCM_AUTH_FAILURE";
    logDecrypt(reason, await diagnosticContext(me, peer, text, { stage: "decrypt" }));
    return { status: "failed", text: "Unable to decrypt this message", reason };
  };

  const version = payloadVersion(text);
  if (version === 3 || version === 2) {
    const parsed = version === 3 ? parseV3Payload(text) : parseV2Payload(text);
    if (parsed.reason) {
      logDecrypt(parsed.reason, await diagnosticContext(me, peer, text, { stage: "parse" }));
      return { status: "failed", text: "Unable to decrypt this message", reason: parsed.reason };
    }
    try {
      const identity = await loadDecryptIdentity(me);
      const plaintext = await decryptCopies(parsed.blobs, identity.privateKey, parsed.eph);
      return { status: "decrypted", text: plaintext, reason: null };
    } catch (error) {
      return failFromError(error);
    }
  }

  const peerPublic = toPublicJwk(peer?.encryptionPublicKey);
  if (!peerPublic) {
    logDecrypt("NO_PEER_KEY", { peerResolved: Boolean(peer?.peerResolved) });
    if (peer?.peerResolved) {
      return { status: "failed", text: "Unable to decrypt this message", reason: "NO_PEER_KEY" };
    }
    return { status: "pending", text: "", reason: "NO_PEER_KEY" };
  }
  if (isSamePublicKey(peerPublic, me?.encryptionPublicKey)) {
    logDecrypt("INVALID_PEER_KEY", { detail: "own-key" });
    return { status: "failed", text: "Unable to decrypt this message", reason: "INVALID_PEER_KEY" };
  }
  const parsed = parseV1Payload(text);
  if (parsed.reason) {
    logDecrypt(parsed.reason);
    return { status: "failed", text: "Unable to decrypt this message", reason: parsed.reason };
  }
  try {
    const identity = await loadDecryptIdentity(me);
    const key = await aesFromEcdh(identity.privateKey, peerPublic);
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

export const hasStoredPrivateKey = (userId) => {
  const id = userIdOf(userId);
  return Boolean(identityCache.get(id) || hasStoredPrivateKeyRecord(id));
};

export const fingerprintPublicKey = publicKeyId;
export { sha256Hex, publicKeyId };
