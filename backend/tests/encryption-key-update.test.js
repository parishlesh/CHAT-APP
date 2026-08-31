import test from "node:test";
import assert from "node:assert/strict";
import { planEncryptionKeyUpdate } from "../src/controllers/auth-controller.js";

test("planEncryptionKeyUpdate never replaces an existing public key", () => {
  const existing = {
    encryptionPublicKey: { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" },
    encryptionKeyBackup: null,
  };
  const incoming = { kty: "EC", crv: "P-256", x: "ccc", y: "ddd" };
  assert.equal(planEncryptionKeyUpdate(existing, incoming, null).action, "conflict");
});

test("planEncryptionKeyUpdate can attach a backup to a matching identity", () => {
  const key = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const backup = { v: 1, salt: "s", iv: "i", ciphertext: "c" };
  const plan = planEncryptionKeyUpdate({ encryptionPublicKey: key }, key, backup);
  assert.equal(plan.action, "update");
  assert.equal(plan.requireEmptyPublic, false);
  assert.equal(plan.update.encryptionKeyBackup.ciphertext, "c");
  assert.equal("encryptionPublicKey" in plan.update, false);
});

test("the first public key is written atomically only when none exists", () => {
  const incoming = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const plan = planEncryptionKeyUpdate({}, incoming, null);
  assert.equal(plan.action, "update");
  assert.equal(plan.requireEmptyPublic, true);
  assert.equal(plan.update.encryptionPublicKey.x, "aaa");
});
