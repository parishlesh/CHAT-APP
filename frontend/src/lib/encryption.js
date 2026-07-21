// Portfolio-grade E2E demonstration: ECDH P-256 + HKDF + AES-GCM. This is not
// an audited Signal-style protocol: it has no ratchet or session forward secrecy.
// Private JWKs live in localStorage for demo portability; production code should use
// a hardened keystore and device-bound credential protection instead.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const prefix = "e2e:v1:";

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const privateKeyName = (userId) => `chat-e2e-private-${userId}`;

async function loadOrCreateKeyPair(userId) {
  const saved = localStorage.getItem(privateKeyName(userId));
  if (saved) {
    const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(saved), { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const publicJwk = JSON.parse(localStorage.getItem(`${privateKeyName(userId)}-public`));
    return { privateKey, publicJwk };
  }
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  localStorage.setItem(privateKeyName(userId), JSON.stringify(privateJwk));
  localStorage.setItem(`${privateKeyName(userId)}-public`, JSON.stringify(publicJwk));
  return { privateKey: pair.privateKey, publicJwk };
}

async function sharedAesKey(myId, peerPublicJwk) {
  const { privateKey } = await loadOrCreateKeyPair(myId);
  const peerKey = await crypto.subtle.importKey("jwk", peerPublicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, privateKey, 256);
  const material = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("chat-app-e2e-v1"), info: encoder.encode("message-text") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function ensureEncryptionKey(user, axiosInstance) {
  if (!user?._id || !window.crypto?.subtle) return user;
  try {
    const { publicJwk } = await loadOrCreateKeyPair(user._id);
    const { data } = await axiosInstance.put("/auth/encryption-key", { encryptionPublicKey: publicJwk });
    return data;
  } catch {
    return user;
  }
}

export async function encryptText(text, me, recipient) {
  if (!text || !recipient?.encryptionPublicKey || !window.crypto?.subtle) return text;
  const key = await sharedAesKey(me._id, recipient.encryptionPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text));
  return `${prefix}${toBase64(iv)}.${toBase64(encrypted)}`;
}

export async function decryptText(text, me, peer) {
  if (!text?.startsWith(prefix) || !peer?.encryptionPublicKey || !window.crypto?.subtle) return text || "";
  try {
    const [iv, ciphertext] = text.slice(prefix.length).split(".");
    const key = await sharedAesKey(me._id, peer.encryptionPublicKey);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext));
    return decoder.decode(decrypted);
  } catch { return "Unable to decrypt this message"; }
}
