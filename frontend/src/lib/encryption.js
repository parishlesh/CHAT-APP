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

async function loadOrCreateKeyPair(userId) {
  const id = userIdOf(userId);
  const saved = localStorage.getItem(privateKeyName(id));
  if (saved) {
    try {
      const privateJwk = toPrivateJwk(JSON.parse(saved));
      if (!privateJwk) throw new Error("invalid stored private jwk");
      const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const publicJwk = toPublicJwk(JSON.parse(localStorage.getItem(`${privateKeyName(id)}-public`)))
        || toPublicJwk(privateJwk);
      if (!publicJwk) throw new Error("invalid stored public jwk");
      localStorage.setItem(privateKeyName(id), JSON.stringify(privateJwk));
      localStorage.setItem(`${privateKeyName(id)}-public`, JSON.stringify(publicJwk));
      return { privateKey, publicJwk, created: false };
    } catch (error) {
      logDecrypt("KEY_IMPORT_FAILED", { stage: "local-private" });
      throw error;
    }
  }
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const privateJwk = toPrivateJwk(await crypto.subtle.exportKey("jwk", pair.privateKey));
  const publicJwk = toPublicJwk(await crypto.subtle.exportKey("jwk", pair.publicKey));
  localStorage.setItem(privateKeyName(id), JSON.stringify(privateJwk));
  localStorage.setItem(`${privateKeyName(id)}-public`, JSON.stringify(publicJwk));
  return { privateKey: pair.privateKey, publicJwk, created: true };
}

async function sharedAesKey(myId, peerPublicJwk) {
  const publicJwk = toPublicJwk(peerPublicJwk);
  if (!publicJwk) throw new Error("invalid peer key");
  const { privateKey } = await loadOrCreateKeyPair(myId);
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

export async function ensureEncryptionKey(user, axiosInstance) {
  const id = userIdOf(user);
  if (!id || !window.crypto?.subtle) return user;
  try {
    const { publicJwk } = await loadOrCreateKeyPair(id);
    if (isSamePublicKey(publicJwk, user.encryptionPublicKey)) {
      return { ...user, encryptionPublicKey: publicJwk };
    }
    const { data } = await axiosInstance.put("/auth/encryption-key", { encryptionPublicKey: publicJwk });
    return data;
  } catch {
    return user;
  }
}

export async function encryptText(text, me, recipient) {
  if (!text || !toPublicJwk(recipient?.encryptionPublicKey) || !window.crypto?.subtle) return text;
  const key = await sharedAesKey(userIdOf(me), recipient.encryptionPublicKey);
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
    const reason = String(error?.message || "").includes("invalid peer") ? "INVALID_PEER_KEY" : "CRYPTO_DECRYPT_FAILED";
    logDecrypt(reason);
    return { status: "failed", text: "Unable to decrypt this message", reason };
  }
}

export async function decryptText(text, me, peer) {
  const result = await decryptMessage(text, me, peer);
  return result.status === "pending" ? "" : result.text;
}
