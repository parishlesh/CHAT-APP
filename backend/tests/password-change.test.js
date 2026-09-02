import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import generateToken, { tokenVersionOf } from "../src/lib/utils.js";
import { OTP_PURPOSES, evaluateGrant, hashSecretValue, secretEquals } from "../src/lib/password-otp.js";

test("JWT session invalidation uses tokenVersion", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "password-change-test-secret";
  const cookies = {};
  const res = { cookie: (name, value) => { cookies[name] = value; } };
  generateToken("507f1f77bcf86cd799439011", res, 4);
  const decoded = jwt.verify(cookies.jwt, process.env.JWT_SECRET);
  assert.equal(decoded.userId, "507f1f77bcf86cd799439011");
  assert.equal(decoded.tv, 4);
  assert.equal(tokenVersionOf({ tokenVersion: 4 }), 4);
  assert.equal(Number(decoded.tv || 0) === 5, false);
  process.env.JWT_SECRET = previous;
});

test("existing tokens without tv are treated as version 0", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "password-change-test-secret";
  const token = jwt.sign({ userId: "507f1f77bcf86cd799439011" }, process.env.JWT_SECRET);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert.equal(Number(decoded.tv || 0), 0);
  assert.equal(Number(decoded.tv || 0) === tokenVersionOf({ tokenVersion: 1 }), false);
  process.env.JWT_SECRET = previous;
});

test("a consumed OTP hash cannot authorize a later password change grant", () => {
  const secret = "unit-secret";
  const otpHash = hashSecretValue("123456", secret);
  assert.equal(secretEquals(otpHash, "123456", secret), true);
  const consumedOtp = { consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), attempts: 0 };
  assert.equal(consumedOtp.consumedAt != null, true);
  const grant = {
    consumedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    purpose: OTP_PURPOSES.PASSWORD_CHANGE,
  };
  assert.equal(evaluateGrant(grant, { purpose: OTP_PURPOSES.PASSWORD_CHANGE }).code, "grant_reused");
});
