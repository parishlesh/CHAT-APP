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

test("initiator cannot send again after a request is declined", () => {
  assert.throws(() => assertCanSendMessage({ status: "declined", initiatedBy: initiator }, initiator), AppError);
});

test("recipient can message back after declining, restarting the request themselves", () => {
  assert.doesNotThrow(() => assertCanSendMessage({ status: "declined", initiatedBy: initiator }, recipient));
});

test("accepted conversations allow either participant to send", () => {
  assert.doesNotThrow(() => assertCanSendMessage({ status: "accepted", initiatedBy: initiator }, recipient));
  assert.equal(REQUEST_DECLINED_TEXT.includes("rejected"), true);
});
