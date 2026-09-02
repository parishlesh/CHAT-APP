import test from "node:test";
import assert from "node:assert/strict";
import { planEncryptionKeyUpdate, planEncryptionKeyReset, planPasswordEncryptionUpdate } from "../src/controllers/auth-controller.js";

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

test("planEncryptionKeyUpdate can attach a backup over an invalid leftover backup", () => {
  const key = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const backup = { v: 1, salt: "s", iv: "i", ciphertext: "c" };
  const plan = planEncryptionKeyUpdate({ encryptionPublicKey: key, encryptionKeyBackup: {} }, key, backup);
  assert.equal(plan.action, "update");
  assert.equal(plan.update.encryptionKeyBackup.ciphertext, "c");
});

test("the first public key is written atomically only when none exists", () => {
  const incoming = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const plan = planEncryptionKeyUpdate({}, incoming, null);
  assert.equal(plan.action, "update");
  assert.equal(plan.requireEmptyPublic, true);
  assert.equal(plan.update.encryptionPublicKey.x, "aaa");
});

test("planEncryptionKeyReset replaces a public key only when no wrapped backup exists", () => {
  const oldKey = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const newKey = { kty: "EC", crv: "P-256", x: "ccc", y: "ddd" };
  const backup = { v: 1, salt: "s", iv: "i", ciphertext: "c" };
  const plan = planEncryptionKeyReset({ encryptionPublicKey: oldKey }, newKey, backup);
  assert.equal(plan.action, "reset");
  assert.equal(plan.update.encryptionPublicKey.x, "ccc");
  assert.equal(plan.update.encryptionKeyBackup.ciphertext, "c");
});

test("planEncryptionKeyReset refuses to overwrite a recoverable backup", () => {
  const oldKey = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const newKey = { kty: "EC", crv: "P-256", x: "ccc", y: "ddd" };
  const backup = { v: 1, salt: "s", iv: "i", ciphertext: "c" };
  const plan = planEncryptionKeyReset(
    { encryptionPublicKey: oldKey, encryptionKeyBackup: backup },
    newKey,
    backup
  );
  assert.equal(plan.action, "conflict");
});

test("password change rewraps backup without rotating the public identity", () => {
  const key = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const oldBackup = { v: 1, salt: "old", iv: "old", ciphertext: "old" };
  const newBackup = { v: 1, salt: "new", iv: "new", ciphertext: "new" };
  const plan = planPasswordEncryptionUpdate(
    { encryptionPublicKey: key, encryptionKeyBackup: oldBackup },
    key,
    newBackup
  );
  assert.equal(plan.action, "rewrap");
  assert.equal(plan.encryptionUpdate.encryptionKeyBackup.ciphertext, "new");
  assert.equal("encryptionPublicKey" in plan.encryptionUpdate, false);
});

test("password change refuses a backup for a different E2E identity", () => {
  const existing = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const other = { kty: "EC", crv: "P-256", x: "ccc", y: "ddd" };
  const backup = { v: 1, salt: "s", iv: "i", ciphertext: "c" };
  const plan = planPasswordEncryptionUpdate(
    { encryptionPublicKey: existing, encryptionKeyBackup: backup },
    other,
    backup
  );
  assert.equal(plan.action, "identity-mismatch");
});

test("password change without a local private key clears only the wrapped backup", () => {
  const key = { kty: "EC", crv: "P-256", x: "aaa", y: "bbb" };
  const backup = { v: 1, salt: "s", iv: "i", ciphertext: "c" };
  const plan = planPasswordEncryptionUpdate(
    { encryptionPublicKey: key, encryptionKeyBackup: backup },
    null,
    null
  );
  assert.equal(plan.action, "clear-unrecoverable-backup");
  assert.equal(plan.encryptionUpdate.encryptionKeyBackup, null);
  assert.equal("encryptionPublicKey" in plan.encryptionUpdate, false);
});
