const PREFIX_V1 = "e2e:v1:";
const PREFIX_V2 = "e2e:v2:";
const PREFIX_V3 = "e2e:v3:";

export const isEncryptedEnvelope = (text) => (
  typeof text === "string"
  && (text.startsWith(PREFIX_V1) || text.startsWith(PREFIX_V2) || text.startsWith(PREFIX_V3))
);

export const describeEncryptedText = (text) => {
  if (!isEncryptedEnvelope(text)) return { encryptionVersion: null, keyId: null };
  if (text.startsWith(PREFIX_V3)) {
    try {
      const parsed = JSON.parse(Buffer.from(text.slice(PREFIX_V3.length), "base64").toString("utf8"));
      return {
        encryptionVersion: 3,
        keyId: typeof parsed?.keyId === "string" ? parsed.keyId : null,
      };
    } catch {
      return { encryptionVersion: 3, keyId: null };
    }
  }
  if (text.startsWith(PREFIX_V2)) return { encryptionVersion: 2, keyId: null };
  return { encryptionVersion: 1, keyId: null };
};
