import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.window = { crypto: globalThis.crypto };
globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};
globalThis.sessionStorage = {
  getItem: (key) => (store.has(`s:${key}`) ? store.get(`s:${key}`) : null),
  setItem: (key, value) => { store.set(`s:${key}`, String(value)); },
  removeItem: (key) => { store.delete(`s:${key}`); },
};

const { encryptText, decryptText, clearSessionWrapPassword, hasStoredPrivateKey } = await import("../../frontend/src/lib/encryption.js");

function forgetDevice(userId) {
  clearSessionWrapPassword();
  localStorage.removeItem(`chat-e2e-private-${userId}`);
  localStorage.removeItem(`chat-e2e-private-${userId}-public`);
  localStorage.removeItem(`chat-e2e-wrapped-${userId}`);
}

async function provision(user) {
  const { ensureEncryptionKey } = await import("../../frontend/src/lib/encryption.js");
  await ensureEncryptionKey(user, {
    put: async (_url, body) => ({ data: { encryptionPublicKey: body.encryptionPublicKey, encryptionKeyBackup: body.encryptionKeyBackup } }),
  }, "test-password");
}

test("peer can decrypt text encrypted with their public key", async () => {
  const alice = { _id: "alice" };
  const bob = { _id: "bob" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-public"));
  assert.ok(alicePub?.x && bobPub?.x);
  const messyBob = { ...bobPub, key_ops: ["deriveBits"], ext: true };
  const messyAlice = { ...alicePub, key_ops: ["deriveBits"], ext: true };
  const ciphertext = await encryptText("hello user 2", { ...alice, encryptionPublicKey: messyAlice }, { encryptionPublicKey: messyBob });
  assert.equal(ciphertext.startsWith("e2e:v3:"), true);
  const transported = JSON.parse(JSON.stringify(ciphertext));
  assert.equal(await decryptText(transported, bob, { encryptionPublicKey: messyAlice }), "hello user 2");
  assert.equal(await decryptText(transported, alice, { encryptionPublicKey: messyBob }), "hello user 2");
});

test("ciphertext is never returned while the local identity is missing", async () => {
  const { decryptMessage, isEncryptedText } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "alice" };
  const bob = { _id: "bob" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-public"));
  const ciphertext = await encryptText("secret", { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub });
  assert.equal(isEncryptedText(ciphertext), true);
  const pending = await decryptMessage(ciphertext, { _id: "stranger" }, { encryptionPublicKey: alicePub });
  assert.equal(pending.status, "failed");
  assert.equal(pending.text, "Unable to decrypt this message");
  assert.equal(isEncryptedText(pending.text), false);
  assert.equal(await decryptText(ciphertext, { _id: "stranger" }, { encryptionPublicKey: alicePub }), "Unable to decrypt this message");
});

test("private jwk extra fields do not break decryption", async () => {
  const { decryptMessage, ensureEncryptionKey } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "alice-ops" };
  const bob = { _id: "bob-ops" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-ops-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-ops-public"));
  const wrapped = localStorage.getItem("chat-e2e-wrapped-alice-ops");
  forgetDevice("alice-ops");
  localStorage.setItem("chat-e2e-wrapped-alice-ops", wrapped);
  localStorage.setItem("chat-e2e-private-alice-ops-public", JSON.stringify({ ...alicePub, key_ops: ["deriveKey", "deriveBits"], alg: "ECDH", ext: true }));
  await ensureEncryptionKey({ ...alice, encryptionPublicKey: alicePub }, { put: async (_url, body) => ({ data: body }) }, "test-password");
  const ciphertext = await encryptText("still works", { ...bob, encryptionPublicKey: bobPub }, { encryptionPublicKey: alicePub });
  const result = await decryptMessage(ciphertext, alice, { encryptionPublicKey: bobPub });
  assert.equal(result.status, "decrypted");
  assert.equal(result.text, "still works");
});

test("a stale local public copy does not block restore of the wrapped private identity", async () => {
  const { ensureEncryptionKey, isEncryptionReady, decryptText } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "stale-pub" };
  const bob = { _id: "stale-pub-bob" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-stale-pub-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-stale-pub-bob-public"));
  const wrapped = localStorage.getItem("chat-e2e-wrapped-stale-pub");
  forgetDevice("stale-pub");
  localStorage.setItem("chat-e2e-wrapped-stale-pub", wrapped);
  localStorage.setItem("chat-e2e-private-stale-pub-public", JSON.stringify({ kty: "EC", crv: "P-256", x: "aaaa", y: "bbbb" }));
  await ensureEncryptionKey({ ...alice, encryptionPublicKey: alicePub }, { put: async (_url, body) => ({ data: body }) }, "test-password");
  assert.equal(isEncryptionReady(), true);
  const ciphertext = await encryptText("recovered", { ...bob, encryptionPublicKey: bobPub }, { encryptionPublicKey: alicePub });
  assert.equal(await decryptText(ciphertext, alice, { encryptionPublicKey: bobPub }), "recovered");
});

test("a matching wrapped identity stored under another local id is recovered without generating", async () => {
  const { ensureEncryptionKey, isEncryptionReady, decryptText } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "canonical-id" };
  const bob = { _id: "scan-bob" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-canonical-id-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-scan-bob-public"));
  const wrapped = localStorage.getItem("chat-e2e-wrapped-canonical-id");
  localStorage.removeItem("chat-e2e-wrapped-canonical-id");
  localStorage.removeItem("chat-e2e-private-canonical-id-public");
  localStorage.setItem("chat-e2e-wrapped-other-slot", wrapped);
  const puts = [];
  await ensureEncryptionKey({ ...alice, encryptionPublicKey: alicePub }, {
    put: async (_url, body) => {
      puts.push(body);
      return { data: body };
    },
  }, "test-password");
  assert.equal(isEncryptionReady(), true);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].encryptionPublicKey.x, alicePub.x);
  assert.ok(puts[0].encryptionKeyBackup?.ciphertext);
  const ciphertext = await encryptText("scanned", { ...bob, encryptionPublicKey: bobPub }, { encryptionPublicKey: alicePub });
  assert.equal(await decryptText(ciphertext, alice, { encryptionPublicKey: bobPub }), "scanned");
});

test("server backup from GET restores when the auth payload omitted it", async () => {
  const { ensureEncryptionKey, isEncryptionReady, decryptText } = await import("../../frontend/src/lib/encryption.js");
  let saved = null;
  await ensureEncryptionKey({ _id: "get-backup-user" }, {
    put: async (_url, body) => {
      saved = body;
      return { data: body };
    },
  }, "password1");
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-public"));
  const ciphertext = await encryptText("from get", { _id: "get-backup-user", encryptionPublicKey: saved.encryptionPublicKey }, { encryptionPublicKey: bobPub });
  forgetDevice("get-backup-user");
  const second = await ensureEncryptionKey({
    _id: "get-backup-user",
    encryptionPublicKey: saved.encryptionPublicKey,
  }, {
    put: async (_url, body) => ({ data: body }),
    get: async () => ({
      data: {
        encryptionPublicKey: saved.encryptionPublicKey,
        encryptionKeyBackup: saved.encryptionKeyBackup,
        hasPublicKey: true,
        hasWrappedBackup: true,
        backupLength: saved.encryptionKeyBackup.ciphertext.length,
      },
    }),
  }, "password1");
  assert.equal(isEncryptionReady(), true);
  assert.equal(second.encryptionPublicKey.x, saved.encryptionPublicKey.x);
  assert.equal(await decryptText(ciphertext, { _id: "get-backup-user", encryptionPublicKey: second.encryptionPublicKey }, { encryptionPublicKey: bobPub }), "from get");
});

test("own public key is not treated as a usable peer key", async () => {
  const { decryptMessage, resolveConversationPeerKey } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "alice" };
  await provision(alice);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-public"));
  const ciphertext = await encryptText("hello user 2", { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub });
  const result = await decryptMessage(ciphertext, { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: alicePub });
  assert.equal(result.status, "decrypted");
  assert.equal(result.text, "hello user 2");
  assert.equal(resolveConversationPeerKey({ ...alice, encryptionPublicKey: alicePub }, { _id: "alice", encryptionPublicKey: alicePub }), null);
});

test("a second device does not generate or upload a replacement identity", async () => {
  const { ensureEncryptionKey } = await import("../../frontend/src/lib/encryption.js");
  const serverPub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-public"));
  forgetDevice("device-b-user");
  const puts = [];
  const axios = { put: async (_url, body) => { puts.push(body); return { data: body }; } };
  const result = await ensureEncryptionKey({ _id: "device-b-user", encryptionPublicKey: serverPub }, axios, "password1");
  assert.equal(puts.length, 0);
  assert.equal(hasStoredPrivateKey("device-b-user"), false);
  assert.equal(result.encryptionPublicKey.x, serverPub.x);
  assert.equal("encryptionKeyBackup" in result, false);
});

test("wrapped private key restores the same identity and decrypts on another device", async () => {
  const { ensureEncryptionKey, decryptText, isEncryptionReady } = await import("../../frontend/src/lib/encryption.js");
  let saved = null;
  const axios = {
    put: async (_url, body) => {
      saved = body;
      return { data: { encryptionPublicKey: body.encryptionPublicKey, encryptionKeyBackup: body.encryptionKeyBackup } };
    },
  };
  const first = await ensureEncryptionKey({ _id: "wrap-user" }, axios, "password1");
  assert.ok(saved?.encryptionKeyBackup?.ciphertext);
  assert.equal(first.encryptionPublicKey.x, saved.encryptionPublicKey.x);
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-public"));
  const ciphertext = await encryptText("hello both devices", { _id: "wrap-user", encryptionPublicKey: first.encryptionPublicKey }, { encryptionPublicKey: bobPub });
  forgetDevice("wrap-user");
  const putsAfter = [];
  const axiosRestore = {
    put: async (_url, body) => {
      putsAfter.push(body);
      return { data: body };
    },
  };
  const second = await ensureEncryptionKey({
    _id: "wrap-user",
    encryptionPublicKey: saved.encryptionPublicKey,
    encryptionKeyBackup: saved.encryptionKeyBackup,
  }, axiosRestore, "password1");
  assert.equal(putsAfter.length, 0);
  assert.equal(second.encryptionPublicKey.x, first.encryptionPublicKey.x);
  assert.equal(isEncryptionReady(), true);
  assert.equal(await decryptText(ciphertext, { _id: "wrap-user", encryptionPublicKey: second.encryptionPublicKey }, { encryptionPublicKey: bobPub }), "hello both devices");
});

test("legacy e2e:v1 payloads still decrypt", async () => {
  const alice = { _id: "alice-v1" };
  const bob = { _id: "bob-v1" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-v1-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-v1-public"));
  const ciphertext = await encryptText("old payload", alice, { encryptionPublicKey: bobPub }, { version: 1 });
  assert.equal(ciphertext.startsWith("e2e:v1:"), true);
  assert.equal(await decryptText(ciphertext, bob, { encryptionPublicKey: alicePub }), "old payload");
});

test("recipient decrypts when the sender device private key does not match the published sender key", async () => {
  const { ensureEncryptionKey, decryptText: decrypt } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "alice-phone" };
  const bob = { _id: "bob-laptop" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-phone-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-laptop-public"));
  forgetDevice("alice-phone");
  await ensureEncryptionKey({ _id: "alice-phone" }, { put: async (_url, body) => ({ data: body }) }, "other-device");
  const rotated = JSON.parse(localStorage.getItem("chat-e2e-private-alice-phone-public"));
  assert.notEqual(rotated.x, alicePub.x);
  const ciphertext = await encryptText("Hello from phone", { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub });
  assert.equal(ciphertext.startsWith("e2e:v3:"), true);
  assert.equal(await decrypt(ciphertext, { ...bob, encryptionPublicKey: bobPub }, { encryptionPublicKey: alicePub }), "Hello from phone");
});

test("login with matching local key uploads a wrapped backup automatically", async () => {
  const { ensureEncryptionKey, isEncryptionReady } = await import("../../frontend/src/lib/encryption.js");
  const puts = [];
  const axios = {
    put: async (_url, body) => {
      puts.push(body);
      return { data: { encryptionPublicKey: body.encryptionPublicKey, encryptionKeyBackup: body.encryptionKeyBackup } };
    },
  };
  await ensureEncryptionKey({ _id: "backup-user" }, axios, "password1");
  assert.equal(isEncryptionReady(), true);
  assert.ok(puts[0]?.encryptionKeyBackup?.ciphertext);
  const published = puts[0].encryptionPublicKey;
  const secondPuts = [];
  await ensureEncryptionKey({
    _id: "backup-user",
    encryptionPublicKey: published,
    encryptionKeyBackup: puts[0].encryptionKeyBackup,
  }, {
    put: async (_url, body) => {
      secondPuts.push(body);
      return { data: body };
    },
  }, "password1");
  assert.equal(secondPuts.length, 0);
  assert.equal(isEncryptionReady(), true);
});

test("a mismatched local key is cleared and does not replace the published identity", async () => {
  const { ensureEncryptionKey, isEncryptionReady } = await import("../../frontend/src/lib/encryption.js");
  await provision({ _id: "stable-user" });
  const published = JSON.parse(localStorage.getItem("chat-e2e-private-stable-user-public"));
  await provision({ _id: "intruder-keys" });
  forgetDevice("stable-user");
  localStorage.setItem("chat-e2e-wrapped-stable-user", localStorage.getItem("chat-e2e-wrapped-intruder-keys"));
  localStorage.setItem("chat-e2e-private-stable-user-public", localStorage.getItem("chat-e2e-private-intruder-keys-public"));
  const puts = [];
  const result = await ensureEncryptionKey({ _id: "stable-user", encryptionPublicKey: published }, {
    put: async (_url, body) => {
      puts.push(body);
      return { data: body };
    },
  }, "password1");
  assert.equal(puts.length, 0);
  assert.equal(result.encryptionPublicKey.x, published.x);
  assert.equal(isEncryptionReady(), false);
  assert.equal(hasStoredPrivateKey("stable-user"), false);
});

test("plaintext private jwk is not stored in localStorage", async () => {
  await provision({ _id: "sealed-user" });
  assert.equal(localStorage.getItem("chat-e2e-private-sealed-user"), null);
  assert.ok(localStorage.getItem("chat-e2e-wrapped-sealed-user"));
  assert.equal(String(localStorage.getItem("chat-e2e-wrapped-sealed-user")).includes('"d":'), false);
});

test("a 409 identity conflict restores the canonical backup instead of keeping a generated key", async () => {
  const { ensureEncryptionKey, decryptText, isEncryptionReady } = await import("../../frontend/src/lib/encryption.js");
  let saved = null;
  await ensureEncryptionKey({ _id: "race-user" }, {
    put: async (_url, body) => {
      saved = body;
      return { data: body };
    },
  }, "password1");
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-public"));
  const ciphertext = await encryptText("race safe", { _id: "race-user", encryptionPublicKey: saved.encryptionPublicKey }, { encryptionPublicKey: bobPub });
  forgetDevice("race-user");
  const result = await ensureEncryptionKey({ _id: "race-user" }, {
    put: async () => {
      const error = new Error("conflict");
      error.response = {
        status: 409,
        data: {
          encryptionPublicKey: saved.encryptionPublicKey,
          encryptionKeyBackup: saved.encryptionKeyBackup,
        },
      };
      throw error;
    },
  }, "password1");
  assert.equal(result.encryptionPublicKey.x, saved.encryptionPublicKey.x);
  assert.equal(isEncryptionReady(), true);
  assert.equal(await decryptText(ciphertext, { _id: "race-user", encryptionPublicKey: result.encryptionPublicKey }, { encryptionPublicKey: bobPub }), "race safe");
});

test("legacy plaintext private keys migrate into wrapped local storage", async () => {
  const { ensureEncryptionKey, decryptText } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "legacy-alice" };
  const bob = { _id: "legacy-bob" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-legacy-alice-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-legacy-bob-public"));
  const wrapped = JSON.parse(localStorage.getItem("chat-e2e-wrapped-legacy-alice"));
  forgetDevice("legacy-alice");
  const iv = Uint8Array.from(atob(wrapped.iv), (char) => char.charCodeAt(0));
  const ciphertextBytes = Uint8Array.from(atob(wrapped.ciphertext), (char) => char.charCodeAt(0));
  const deviceRaw = Uint8Array.from(atob(localStorage.getItem("chat-e2e-device-wrap")), (char) => char.charCodeAt(0));
  const wrappingKey = await crypto.subtle.importKey("raw", deviceRaw, { name: "AES-GCM" }, false, ["decrypt"]);
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, ciphertextBytes);
  const privateJwk = JSON.parse(new TextDecoder().decode(bytes));
  localStorage.setItem("chat-e2e-private-legacy-alice", JSON.stringify({ ...privateJwk, key_ops: ["deriveBits"], alg: "ECDH" }));
  localStorage.setItem("chat-e2e-private-legacy-alice-public", JSON.stringify(alicePub));
  await ensureEncryptionKey({ ...alice, encryptionPublicKey: alicePub }, { put: async (_url, body) => ({ data: body }) }, "test-password");
  assert.equal(localStorage.getItem("chat-e2e-private-legacy-alice"), null);
  assert.ok(localStorage.getItem("chat-e2e-wrapped-legacy-alice"));
  const ciphertext = await encryptText("migrated", { ...bob, encryptionPublicKey: bobPub }, { encryptionPublicKey: alicePub });
  assert.equal(await decryptText(ciphertext, { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub }), "migrated");
});

test("decrypt waits for initialization instead of failing early", async () => {
  const { decryptMessage, ensureEncryptionKey, resetEncryptionStatus } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "wait-alice" };
  const bob = { _id: "wait-bob" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-wait-alice-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-wait-bob-public"));
  const ciphertext = await encryptText("after init", { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub });
  resetEncryptionStatus();
  const pending = decryptMessage(ciphertext, { ...bob, encryptionPublicKey: bobPub }, { encryptionPublicKey: alicePub });
  await ensureEncryptionKey({ ...bob, encryptionPublicKey: bobPub }, { put: async (_url, body) => ({ data: body }) }, "test-password");
  const result = await pending;
  assert.equal(result.status, "decrypted");
  assert.equal(result.text, "after init");
});

test("same device restores from wrapped local storage after logout without uploading a new identity", async () => {
  const { ensureEncryptionKey, decryptText, isEncryptionReady } = await import("../../frontend/src/lib/encryption.js");
  let saved = null;
  await ensureEncryptionKey({ _id: "same-device" }, {
    put: async (_url, body) => {
      saved = body;
      return { data: body };
    },
  }, "password1");
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-public"));
  const ciphertext = await encryptText("still here", { _id: "same-device", encryptionPublicKey: saved.encryptionPublicKey }, { encryptionPublicKey: bobPub });
  clearSessionWrapPassword();
  const puts = [];
  const second = await ensureEncryptionKey({
    _id: "same-device",
    encryptionPublicKey: saved.encryptionPublicKey,
    encryptionKeyBackup: saved.encryptionKeyBackup,
  }, {
    put: async (_url, body) => {
      puts.push(body);
      return { data: body };
    },
  }, "password1");
  assert.equal(puts.length, 0);
  assert.equal(isEncryptionReady(), true);
  assert.equal(second.encryptionPublicKey.x, saved.encryptionPublicKey.x);
  assert.equal(await decryptText(ciphertext, { _id: "same-device", encryptionPublicKey: second.encryptionPublicKey }, { encryptionPublicKey: bobPub }), "still here");
});

test("v2 payloads still encrypt and decrypt through the same decryptMessage API", async () => {
  const alice = { _id: "alice-v2keep" };
  const bob = { _id: "bob-v2keep" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-alice-v2keep-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-v2keep-public"));
  const ciphertext = await encryptText("classic v2", { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub }, { version: 2 });
  assert.equal(ciphertext.startsWith("e2e:v2:"), true);
  assert.equal(await decryptText(ciphertext, bob, { encryptionPublicKey: alicePub }), "classic v2");
});

test("a first identity is never published without a wrapped backup", async () => {
  const { ensureEncryptionKey, isEncryptionReady, clearSessionWrapPassword } = await import("../../frontend/src/lib/encryption.js");
  clearSessionWrapPassword();
  forgetDevice("needs-password");
  const puts = [];
  await ensureEncryptionKey({ _id: "needs-password" }, {
    put: async (_url, body) => {
      puts.push(body);
      return { data: body };
    },
  });
  assert.equal(puts.length, 0);
  assert.equal(isEncryptionReady(), false);
});

test("encrypt refuses a silent plaintext fallback when encryption is not ready", async () => {
  const { encryptText, resetEncryptionStatus } = await import("../../frontend/src/lib/encryption.js");
  resetEncryptionStatus();
  await assert.rejects(
    () => encryptText("secret", { _id: "nobody" }, { encryptionPublicKey: { kty: "EC", crv: "P-256", x: "YQ", y: "Yg" } }),
    /ENCRYPTION_NOT_READY|KEY_|CRYPTO|NO_PEER|missing/
  );
});

test("password change rewraps the same identity and does not download chat history", async () => {
  const {
    ensureEncryptionKey,
    preparePasswordChangeBackup,
    decryptText,
    isEncryptionReady,
  } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "pw-change-user" };
  const bob = { _id: "pw-change-bob" };
  await provision(alice);
  await provision(bob);
  const alicePub = JSON.parse(localStorage.getItem("chat-e2e-private-pw-change-user-public"));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-pw-change-bob-public"));
  const ciphertext = await encryptText("historical", { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub });
  const gets = [];
  const puts = [];
  const wrapped = await preparePasswordChangeBackup({ ...alice, encryptionPublicKey: alicePub }, "brand-new-password");
  assert.equal(wrapped.available, true);
  assert.equal(wrapped.encryptionPublicKey.x, alicePub.x);
  assert.ok(wrapped.encryptionKeyBackup?.salt);
  assert.ok(wrapped.encryptionKeyBackup?.iv);
  assert.equal(gets.length, 0);
  assert.equal(puts.length, 0);
  assert.equal(await decryptText(ciphertext, { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub }), "historical");
  forgetDevice("pw-change-user");
  const restored = await ensureEncryptionKey({
    ...alice,
    encryptionPublicKey: wrapped.encryptionPublicKey,
    encryptionKeyBackup: wrapped.encryptionKeyBackup,
  }, {
    put: async (_url, body) => {
      puts.push(body);
      return { data: body };
    },
    get: async () => {
      gets.push("encryption-key");
      return {
        data: {
          encryptionPublicKey: wrapped.encryptionPublicKey,
          encryptionKeyBackup: wrapped.encryptionKeyBackup,
          hasPublicKey: true,
          hasWrappedBackup: true,
        },
      };
    },
  }, "brand-new-password");
  assert.equal(isEncryptionReady(), true);
  assert.equal(restored.encryptionPublicKey.x, alicePub.x);
  assert.equal(puts.length, 0);
  assert.equal(await decryptText(ciphertext, { ...alice, encryptionPublicKey: restored.encryptionPublicKey }, { encryptionPublicKey: bobPub }), "historical");
});

test("password change without a local private key does not generate a replacement identity", async () => {
  const { preparePasswordChangeBackup, hasStoredPrivateKey } = await import("../../frontend/src/lib/encryption.js");
  forgetDevice("pw-missing-user");
  const result = await preparePasswordChangeBackup({
    _id: "pw-missing-user",
    encryptionPublicKey: { kty: "EC", crv: "P-256", x: "YQ", y: "Yg" },
  }, "new-password");
  assert.equal(result.available, false);
  assert.equal(hasStoredPrivateKey("pw-missing-user"), false);
});
