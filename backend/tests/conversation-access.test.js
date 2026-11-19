import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/lib/errors.js";
import {
  assertCanSendMessage, canInteract, isRejectedParty, reachablePeerIds, statusAfterSend, REQUEST_DECLINED_TEXT,
} from "../src/lib/conversation-access.js";

const initiator = "507f1f77bcf86cd799439011";
const recipient = "507f1f77bcf86cd799439012";
const third = "507f1f77bcf86cd799439013";
const declined = { status: "declined", initiatedBy: initiator, participants: [initiator, recipient] };

test("recipient cannot send while a request is pending", () => {
  assert.throws(() => assertCanSendMessage({ status: "pending", initiatedBy: initiator }, recipient), AppError);
});

test("initiator can send while a request is pending", () => {
  assert.doesNotThrow(() => assertCanSendMessage({ status: "pending", initiatedBy: initiator }, initiator));
});

test("a rejected sender stays locked out", () => {
  assert.throws(() => assertCanSendMessage(declined, initiator), AppError);
  assert.equal(canInteract(declined, initiator), false);
  assert.equal(isRejectedParty(declined, initiator), true);
  assert.equal(isRejectedParty(declined, recipient), false);
});

test("only the person who rejected can reach out again, and that reopens the chat for both", () => {
  assert.doesNotThrow(() => assertCanSendMessage(declined, recipient));
  assert.deepEqual(statusAfterSend(declined, recipient), { status: "accepted", reopened: true });
  const reopened = { ...declined, status: "accepted" };
  assert.equal(canInteract(reopened, initiator), true);
});

test("first message creates a pending request; normal chats don't change", () => {
  assert.deepEqual(statusAfterSend(null, initiator), { status: "pending", initiatedBy: initiator, createdRequest: true });
  assert.equal(statusAfterSend({ status: "accepted", initiatedBy: initiator }, recipient), null);
  assert.equal(statusAfterSend({ status: "pending", initiatedBy: initiator }, initiator), null);
});

test("mood and status broadcasts skip declined chats in both directions", () => {
  const conversations = [declined, { status: "accepted", initiatedBy: initiator, participants: [{ _id: initiator }, { _id: third }] }];
  assert.deepEqual([...reachablePeerIds(conversations, initiator)], [third]);
  assert.deepEqual([...reachablePeerIds([declined], recipient)], [], "declined chats get no status broadcasts either way");
});

test("accepted conversations allow either participant to send", () => {
  assert.doesNotThrow(() => assertCanSendMessage({ status: "accepted", initiatedBy: initiator }, recipient));
  assert.equal(REQUEST_DECLINED_TEXT.includes("rejected"), true);
});
