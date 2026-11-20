import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/lib/errors.js";
import { assertUnlocked, clearedAtFor, hashPin, isLockedFor, issueUnlockToken, pinMatches, validatePin } from "../src/lib/chat-lock.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "unit-test-secret";
const me = "507f1f77bcf86cd799439011";
const other = "507f1f77bcf86cd799439012";
const chat = { _id: "507f1f77bcf86cd7994390aa", lockedBy: [me] };
const request = (token, userId = me) => ({ user: { _id: userId }, headers: token ? { "x-chat-unlock": token } : {} });

test("PINs are 4 to 6 digits and stored hashed", async () => {
  assert.throws(() => validatePin("123"), AppError);
  assert.throws(() => validatePin("1234567"), AppError);
  assert.throws(() => validatePin("12a4"), AppError);
  const hash = await hashPin("2468");
  assert.notEqual(hash, "2468");
  assert.equal(await pinMatches({ chatLockPinHash: hash }, "2468"), true);
  assert.equal(await pinMatches({ chatLockPinHash: hash }, "2469"), false);
  assert.equal(await pinMatches({ chatLockPinHash: null }, "2468"), false);
});

test("locked chats need an unlock token for the same user and chat", () => {
  assert.equal(isLockedFor(chat, me), true);
  assert.equal(isLockedFor(chat, other), false);
  assert.throws(() => assertUnlocked(request(null), chat), (error) => error.status === 423 && error.code === "CHAT_LOCKED");
  const { token } = issueUnlockToken(me, chat._id);
  assert.doesNotThrow(() => assertUnlocked(request(token), chat));
  assert.throws(() => assertUnlocked(request(issueUnlockToken(me, "507f1f77bcf86cd7994390bb").token), chat), AppError);
  assert.doesNotThrow(() => assertUnlocked(request(null, other), chat), "the lock is personal");
});

test("clearedAt is read per user from a Map or plain object", () => {
  const at = new Date("2026-01-01T00:00:00Z");
  assert.equal(clearedAtFor({ clearedAt: new Map([[me, at]]) }, me).toISOString(), at.toISOString());
  assert.equal(clearedAtFor({ clearedAt: { [me]: at } }, other), null);
  assert.equal(clearedAtFor({}, me), null);
});
