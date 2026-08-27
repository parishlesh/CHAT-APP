import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/lib/errors.js";
import { requireObjectId, validateImageDataUrl, validateMessageText, validateExpiresAt } from "../src/lib/validate.js";

test("rejects invalid object ids", () => {
  assert.throws(() => requireObjectId("abc"), AppError);
  assert.throws(() => requireObjectId("12"), AppError);
});

test("accepts valid object ids", () => {
  assert.equal(requireObjectId("507f1f77bcf86cd799439011"), "507f1f77bcf86cd799439011");
});

test("rejects non-image payloads", () => {
  assert.throws(() => validateImageDataUrl("hello"), AppError);
  assert.throws(() => validateImageDataUrl("data:application/pdf;base64,xxx"), AppError);
});

test("accepts jpeg data urls", () => {
  const image = "data:image/jpeg;base64,AAAA";
  assert.equal(validateImageDataUrl(image), image);
});

test("rejects oversized message text", () => {
  assert.throws(() => validateMessageText("x".repeat(20001)), AppError);
});

test("rejects past expiration", () => {
  assert.throws(() => validateExpiresAt(new Date(Date.now() - 1000).toISOString()), AppError);
});
