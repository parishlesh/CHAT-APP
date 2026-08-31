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

const { encryptText, decryptText } = await import("../../frontend/src/lib/encryption.js");

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
  assert.equal(ciphertext.startsWith("e2e:v2:"), true);
  assert.equal(await decryptText(ciphertext, bob, { encryptionPublicKey: messyAlice }), "hello user 2");
  assert.equal(await decryptText(ciphertext, alice, { encryptionPublicKey: messyBob }), "hello user 2");
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
  const { decryptMessage } = await import("../../frontend/src/lib/encryption.js");
  const alice = { _id: "alice-ops" };
  const bob = { _id: "bob-ops" };
  await provision(alice);
  await provision(bob);
  const alicePrivName = "chat-e2e-private-alice-ops";
  const priv = JSON.parse(localStorage.getItem(alicePrivName));
  localStorage.setItem(alicePrivName, JSON.stringify({ ...priv, key_ops: ["deriveKey", "deriveBits"], alg: "ECDH", ext: true }));
  const alicePub = JSON.parse(localStorage.getItem(`${alicePrivName}-public`));
  const bobPub = JSON.parse(localStorage.getItem("chat-e2e-private-bob-ops-public"));
  const ciphertext = await encryptText("still works", { ...bob, encryptionPublicKey: JSON.parse(localStorage.getItem("chat-e2e-private-bob-ops-public")) }, { encryptionPublicKey: alicePub });
  const result = await decryptMessage(ciphertext, alice, { encryptionPublicKey: bobPub });
  assert.equal(result.status, "decrypted");
  assert.equal(result.text, "still works");
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
  const puts = [];
  const axios = { put: async (_url, body) => { puts.push(body); return { data: body }; } };
  const result = await ensureEncryptionKey({ _id: "device-b-user", encryptionPublicKey: serverPub }, axios, "password1");
  assert.equal(puts.length, 0);
  assert.equal(localStorage.getItem("chat-e2e-private-device-b-user"), null);
  assert.equal(result.encryptionPublicKey.x, serverPub.x);
  assert.equal("encryptionKeyBackup" in result, false);
});

test("wrapped private key restores the same identity and decrypts on another device", async () => {
  const { ensureEncryptionKey, decryptText } = await import("../../frontend/src/lib/encryption.js");
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
  localStorage.removeItem("chat-e2e-private-wrap-user");
  localStorage.removeItem("chat-e2e-private-wrap-user-public");
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
  localStorage.removeItem("chat-e2e-private-alice-phone");
  localStorage.removeItem("chat-e2e-private-alice-phone-public");
  await ensureEncryptionKey({ _id: "alice-phone" }, { put: async (_url, body) => ({ data: body }) }, "other-device");
  const rotated = JSON.parse(localStorage.getItem("chat-e2e-private-alice-phone-public"));
  assert.notEqual(rotated.x, alicePub.x);
  const ciphertext = await encryptText("Hello from phone", { ...alice, encryptionPublicKey: alicePub }, { encryptionPublicKey: bobPub });
  assert.equal(ciphertext.startsWith("e2e:v2:"), true);
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

test("a mismatched local key is ignored and does not replace the published identity", async () => {
  const { ensureEncryptionKey, isEncryptionReady } = await import("../../frontend/src/lib/encryption.js");
  await provision({ _id: "stable-user" });
  const published = JSON.parse(localStorage.getItem("chat-e2e-private-stable-user-public"));
  localStorage.removeItem("chat-e2e-private-stable-user");
  localStorage.removeItem("chat-e2e-private-stable-user-public");
  await provision({ _id: "intruder-keys" });
  localStorage.setItem("chat-e2e-private-stable-user", localStorage.getItem("chat-e2e-private-intruder-keys"));
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
  assert.ok(localStorage.getItem("chat-e2e-private-stable-user"));
});
