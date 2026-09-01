import test from "node:test";
import assert from "node:assert/strict";
import { describeEncryptedText, isEncryptedEnvelope } from "../src/lib/envelope.js";

test("describeEncryptedText reads version metadata without decrypting", () => {
  assert.equal(isEncryptedEnvelope("hello"), false);
  assert.deepEqual(describeEncryptedText("e2e:v1:iv.ct"), { encryptionVersion: 1, keyId: null });
  assert.deepEqual(describeEncryptedText("e2e:v2:x.y.iv.ct"), { encryptionVersion: 2, keyId: null });
  const body = Buffer.from(JSON.stringify({ v: 3, keyId: "abc" })).toString("base64");
  assert.deepEqual(describeEncryptedText(`e2e:v3:${body}`), { encryptionVersion: 3, keyId: "abc" });
});
