import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/lib/errors.js";
import { assertCanSendMessage, REQUEST_DECLINED_TEXT } from "../src/lib/conversation-access.js";

const initiator = "507f1f77bcf86cd799439011";
const recipient = "507f1f77bcf86cd799439012";

test("recipient cannot send while a request is pending", () => {
  assert.throws(() => assertCanSendMessage({ status: "pending", initiatedBy: initiator }, recipient), AppError);
});

test("initiator can send while a request is pending", () => {
  assert.doesNotThrow(() => assertCanSendMessage({ status: "pending", initiatedBy: initiator }, initiator));
});

test("recipient cannot send after a request is declined", () => {
  assert.throws(() => assertCanSendMessage({ status: "declined", initiatedBy: initiator }, recipient), AppError);
});

test("accepted conversations allow either participant to send", () => {
  assert.doesNotThrow(() => assertCanSendMessage({ status: "accepted", initiatedBy: initiator }, recipient));
  assert.equal(REQUEST_DECLINED_TEXT.includes("rejected"), true);
});
