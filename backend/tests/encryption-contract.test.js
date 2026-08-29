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

const { encryptText, decryptText } = await import("../../frontend/src/lib/encryption.js");

const dummyPeer = { encryptionPublicKey: { kty: "EC", crv: "P-256", x: "A".repeat(43), y: "B".repeat(43) } };

async function provision(user) {
  try {
    await encryptText("provision", user, dummyPeer);
  } catch {
    /* local keypair is created before peer import */
  }
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
  const ciphertext = await encryptText("hello user 2", alice, { encryptionPublicKey: messyBob });
  assert.equal(ciphertext.startsWith("e2e:v1:"), true);
  assert.equal(await decryptText(ciphertext, bob, { encryptionPublicKey: messyAlice }), "hello user 2");
  assert.equal(await decryptText(ciphertext, alice, { encryptionPublicKey: messyBob }), "hello user 2");
});
