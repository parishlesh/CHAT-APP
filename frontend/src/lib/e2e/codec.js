const encoder = new TextEncoder();

export const PREFIX_V1 = "e2e:v1:";
export const PREFIX_V2 = "e2e:v2:";
export const PREFIX_V3 = "e2e:v3:";

export const userIdOf = (user) => {
  if (user == null) return "";
  if (typeof user === "string" || typeof user === "number") return String(user);
  const raw = user._id != null ? user._id : user.id;
  if (raw == null) return "";
  if (typeof raw === "object" && raw.$oid) return String(raw.$oid);
  return String(raw);
};

export const toBase64Url = (value) => String(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export const toBase64 = (bytes) => {
  const bytesArray = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < bytesArray.length; index += 1) binary += String.fromCharCode(bytesArray[index]);
  return btoa(binary);
};

export const fromBase64 = (value) => {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

export const toHex = (bytes) => {
  const view = new Uint8Array(bytes);
  let hex = "";
  for (let index = 0; index < view.length; index += 1) hex += view[index].toString(16).padStart(2, "0");
  return hex;
};

export const toPublicJwk = (jwk) => {
  let value = jwk;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  if (typeof value.toJSON === "function") {
    try { value = value.toJSON(); } catch { /* keep original */ }
  }
  const kty = value.kty;
  const crv = value.crv || "P-256";
  const x = value.x;
  const y = value.y;
  const curveOk = String(crv).replace(/-/g, "").toUpperCase().includes("P256");
  if ((kty && kty !== "EC") || !curveOk || typeof x !== "string" || typeof y !== "string") {
    return null;
  }
  return { kty: "EC", crv: "P-256", x: toBase64Url(x), y: toBase64Url(y) };
};

export const toPrivateJwk = (jwk) => {
  let value = jwk;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  const publicJwk = toPublicJwk(value);
  if (!publicJwk || typeof value?.d !== "string") return null;
  return { ...publicJwk, d: toBase64Url(value.d), ext: true };
};

export const canonicalPublic = (jwk) => {
  const publicJwk = toPublicJwk(jwk);
  return publicJwk ? `EC:P-256:${publicJwk.x}:${publicJwk.y}` : "";
};

export const publicKeyFingerprint = (jwk) => {
  const publicJwk = toPublicJwk(jwk);
  return publicJwk ? `${publicJwk.x}.${publicJwk.y}` : "";
};

export const isSamePublicKey = (left, right) => {
  const first = canonicalPublic(left);
  const second = canonicalPublic(right);
  return Boolean(first && second && first === second);
};

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes instanceof Uint8Array ? bytes : encoder.encode(String(bytes)));
  return toHex(digest);
}

export async function publicKeyId(jwk) {
  const canonical = canonicalPublic(jwk);
  if (!canonical) return "";
  return sha256Hex(encoder.encode(canonical));
}

export const payloadVersion = (text) => {
  if (typeof text !== "string") return 0;
  if (text.startsWith(PREFIX_V3)) return 3;
  if (text.startsWith(PREFIX_V2)) return 2;
  if (text.startsWith(PREFIX_V1)) return 1;
  return 0;
};

export const isEncryptedText = (text) => payloadVersion(text) > 0;
