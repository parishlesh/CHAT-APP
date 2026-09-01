import { fromBase64, toBase64, toPrivateJwk, toPublicJwk, userIdOf } from "./codec.js";

const DB_NAME = "vibelink-e2e";
const DB_VERSION = 1;
const DEVICE_WRAP_KEY = "chat-e2e-device-wrap";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const privateKeyName = (userId) => `chat-e2e-private-${userIdOf(userId)}`;
export const wrappedKeyName = (userId) => `chat-e2e-wrapped-${userIdOf(userId)}`;
export const publicKeyName = (userId) => `${privateKeyName(userId)}-public`;

let dbPromise = null;

const openDb = () => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("identity")) db.createObjectStore("identity");
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
};

const idbGet = async (storeName, key) => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const idbSet = async (storeName, key, value) => {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
};

const idbDelete = async (storeName, key) => {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
};

const readStoredDeviceWraps = async () => {
  const candidates = [];
  const seen = new Set();
  const add = (raw) => {
    if (!raw || seen.has(raw)) return;
    seen.add(raw);
    candidates.push(raw);
  };
  try {
    add(localStorage.getItem(DEVICE_WRAP_KEY));
  } catch {
    /* ignore */
  }
  const fromIdb = await idbGet("meta", "device-wrap");
  add(fromIdb?.raw);
  return candidates;
};

const persistDeviceWrap = async (raw) => {
  try {
    localStorage.setItem(DEVICE_WRAP_KEY, raw);
  } catch {
    /* private browsing */
  }
  await idbSet("meta", "device-wrap", { raw });
};

const getDeviceWrapRaw = async () => {
  const existing = await readStoredDeviceWraps();
  let raw = existing[0];
  if (!raw) {
    raw = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  }
  await persistDeviceWrap(raw);
  return fromBase64(raw);
};

const importDeviceAesKey = async (raw, usage) => (
  crypto.subtle.importKey("raw", fromBase64(raw), { name: "AES-GCM" }, false, usage)
);

const wrapRecord = async (privateJwk) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await crypto.subtle.importKey("raw", await getDeviceWrapRaw(), { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    encoder.encode(JSON.stringify(privateJwk))
  );
  return { v: 1, iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
};

const unwrapRecord = async (backup) => {
  if (backup?.v !== 1 || typeof backup.iv !== "string" || typeof backup.ciphertext !== "string") {
    throw new Error("invalid stored private jwk");
  }
  const candidates = await readStoredDeviceWraps();
  if (!candidates.length) {
    await getDeviceWrapRaw();
    candidates.push(...await readStoredDeviceWraps());
  }
  let lastError = null;
  for (const raw of candidates) {
    try {
      const wrappingKey = await importDeviceAesKey(raw, ["decrypt"]);
      const bytes = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(backup.iv) },
        wrappingKey,
        fromBase64(backup.ciphertext)
      );
      await persistDeviceWrap(raw);
      return toPrivateJwk(JSON.parse(decoder.decode(bytes)));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("invalid stored private jwk");
};

export const unwrapProtectedRecord = async (wrapped) => unwrapRecord(wrapped);

const logKeystore = (stage, extra = {}) => {
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  console.info("[KEYSTORE]", { stage, ...extra });
};

export const listLocalWrappedRecords = async () => {
  const records = [];
  let localStorageCandidates = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith("chat-e2e-wrapped-")) continue;
      localStorageCandidates += 1;
      try {
        records.push({
          source: "localStorage",
          userId: key.slice("chat-e2e-wrapped-".length),
          wrapped: JSON.parse(localStorage.getItem(key)),
        });
      } catch {
        /* ignore corrupt */
      }
    }
  } catch {
    /* ignore */
  }
  let indexedDbCandidates = 0;
  const db = await openDb();
  if (db) {
    await new Promise((resolve) => {
      try {
        const request = db.transaction("identity", "readonly").objectStore("identity").openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor) {
            resolve();
            return;
          }
          indexedDbCandidates += 1;
          if (cursor.value?.wrapped) {
            records.push({
              source: "indexedDB",
              userId: String(cursor.key),
              wrapped: cursor.value.wrapped,
            });
          }
          cursor.continue();
        };
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  logKeystore("read-start", {
    indexeddbCandidates: indexedDbCandidates,
    localstorageCandidates: localStorageCandidates,
    totalCandidates: records.length,
  });
  return records;
};

export const readLocalPublic = (userId) => {
  try {
    return toPublicJwk(JSON.parse(localStorage.getItem(publicKeyName(userId)) || "null"));
  } catch {
    return null;
  }
};

export const readWrappedIdentity = async (userId) => {
  const id = userIdOf(userId);
  const records = [];
  const fromIdb = await idbGet("identity", id);
  if (fromIdb?.wrapped) records.push(fromIdb.wrapped);
  try {
    const saved = localStorage.getItem(wrappedKeyName(id));
    if (saved) records.push(JSON.parse(saved));
  } catch {
    /* ignore */
  }
  let lastError = null;
  for (const record of records) {
    try {
      return await unwrapRecord(record);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError && records.length) throw lastError;
  return null;
};

export const readLegacyPrivate = (userId) => {
  try {
    const saved = localStorage.getItem(privateKeyName(userId));
    return saved ? toPrivateJwk(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
};

export const persistLocalIdentityRecord = async (userId, privateJwk, publicJwk, keyId) => {
  const id = userIdOf(userId);
  const wrapped = await wrapRecord(privateJwk);
  await idbSet("identity", id, { wrapped, publicJwk, keyId, updatedAt: Date.now() });
  try {
    localStorage.setItem(wrappedKeyName(id), JSON.stringify(wrapped));
    localStorage.setItem(publicKeyName(id), JSON.stringify(publicJwk));
    localStorage.removeItem(privateKeyName(id));
  } catch {
    /* ignore */
  }
};

export const clearStoredIdentity = async (userId) => {
  const id = userIdOf(userId);
  await idbDelete("identity", id);
  try {
    localStorage.removeItem(privateKeyName(id));
    localStorage.removeItem(publicKeyName(id));
    localStorage.removeItem(wrappedKeyName(id));
  } catch {
    /* ignore */
  }
};

export const hasStoredPrivateKey = (userId) => {
  const id = userIdOf(userId);
  try {
    return Boolean(localStorage.getItem(wrappedKeyName(id)) || localStorage.getItem(privateKeyName(id)));
  } catch {
    return false;
  }
};

export const cacheEncryptedMessages = async (peerId, messages) => {
  const id = userIdOf(peerId);
  if (!id || !Array.isArray(messages)) return;
  const records = messages.map((message) => ({
    id: String(message._id),
    conversationPeerId: id,
    text: message.text || "",
    image: message.image || "",
    senderId: message.senderId,
    receiverId: message.receiverId,
    createdAt: message.createdAt,
    seen: message.seen,
    edited: message.edited,
    deleted: message.deleted,
    kind: message.kind,
    systemEvent: message.systemEvent,
    replyTo: message.replyTo,
    expiresAt: message.expiresAt,
    encryptionVersion: message.encryptionVersion || null,
    keyId: message.keyId || null,
  }));
  await idbSet("messages", id, records);
};

export const readCachedMessages = async (peerId) => {
  const id = userIdOf(peerId);
  if (!id) return [];
  const records = await idbGet("messages", id);
  return Array.isArray(records) ? records : [];
};
