import test from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../src/middleware/error-handler.js";
import { AppError } from "../src/lib/errors.js";

function mockRes() {
  return {
    headersSent: false,
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test("hides 500 details from clients", () => {
  const res = mockRes();
  errorHandler(new Error("secret stack"), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Internal server error");
});

test("returns AppError messages for 4xx", () => {
  const res = mockRes();
  errorHandler(new AppError(403, "Forbidden."), {}, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Forbidden.");
});
