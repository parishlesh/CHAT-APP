import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERIC_OTP_SENT_MESSAGE,
  OTP_PURPOSES,
  createGrantToken,
  evaluateGrant,
  evaluateOtpRecord,
  evaluateRequestRate,
  generateOtp,
  hashSecretValue,
  isOtpFormat,
  looksLikeEmail,
  normalizeIdentifier,
  otpErrorMessage,
  secretEquals,
} from "../src/lib/password-otp.js";

test("development OTP is exactly 123456", () => {
  assert.equal(generateOtp("development"), "123456");
  assert.equal(generateOtp("test"), "123456");
});

test("production OTP is a six-digit numeric string", () => {
  for (let index = 0; index < 20; index += 1) {
    const otp = generateOtp("production");
    assert.equal(isOtpFormat(otp), true);
    assert.equal(otp.length, 6);
  }
});

test("production OTP is not the development constant and varies", () => {
  const seen = new Set();
  for (let index = 0; index < 40; index += 1) {
    seen.add(generateOtp("production"));
  }
  assert.equal(seen.has("123456") && seen.size === 1, false);
  assert.ok(seen.size > 1);
});

test("OTP hashes are compared without storing the raw value", () => {
  const hash = hashSecretValue("012483", "unit-secret");
  assert.notEqual(hash, "012483");
  assert.equal(secretEquals(hash, "012483", "unit-secret"), true);
  assert.equal(secretEquals(hash, "012484", "unit-secret"), false);
  assert.equal(isOtpFormat("012483"), true);
});

test("OTP records expire, block reuse, and cap attempts", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(evaluateOtpRecord(null).code, "invalid");
  assert.equal(evaluateOtpRecord({ consumedAt: now, expiresAt: new Date(now.getTime() + 1000), attempts: 0 }, { now }).code, "reused");
  assert.equal(evaluateOtpRecord({ consumedAt: null, expiresAt: new Date(now.getTime() - 1), attempts: 0 }, { now }).code, "expired");
  assert.equal(evaluateOtpRecord({ consumedAt: null, expiresAt: new Date(now.getTime() + 1000), attempts: 5 }, { now }).code, "too_many_attempts");
  assert.equal(evaluateOtpRecord({ consumedAt: null, expiresAt: new Date(now.getTime() + 1000), attempts: 0 }, { now }).ok, true);
});

test("OTP request rate limiting and identifier handling", () => {
  assert.equal(evaluateRequestRate(3).ok, false);
  assert.equal(evaluateRequestRate(2).ok, true);
  assert.equal(otpErrorMessage("too_many_requests"), "Too many OTP requests");
  assert.equal(looksLikeEmail("user@example.com"), true);
  assert.equal(looksLikeEmail("my_username"), false);
  assert.equal(normalizeIdentifier("  Alex  "), "alex");
  assert.match(GENERIC_OTP_SENT_MESSAGE, /If an account matches/i);
});

test("reset grants are short-lived, single-use, and purpose-bound", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const grant = {
    consumedAt: null,
    expiresAt: new Date(now.getTime() + 1000),
    purpose: OTP_PURPOSES.PASSWORD_RESET,
  };
  assert.equal(evaluateGrant(grant, { now, purpose: OTP_PURPOSES.PASSWORD_RESET }).ok, true);
  assert.equal(evaluateGrant({ ...grant, consumedAt: now }, { now }).code, "grant_reused");
  assert.equal(evaluateGrant({ ...grant, expiresAt: new Date(now.getTime() - 1) }, { now }).code, "grant_expired");
  assert.equal(evaluateGrant(grant, { now, purpose: OTP_PURPOSES.PASSWORD_CHANGE }).code, "purpose_mismatch");
  assert.equal(createGrantToken().length, 64);
  assert.notEqual(createGrantToken(), createGrantToken());
});

test("issuing a new OTP consumes the previous unused OTP", () => {
  const now = new Date();
  const previous = { consumedAt: now, expiresAt: new Date(now.getTime() + 60_000), attempts: 0 };
  const next = { consumedAt: null, expiresAt: new Date(now.getTime() + 60_000), attempts: 0 };
  assert.equal(evaluateOtpRecord(previous, { now }).code, "reused");
  assert.equal(evaluateOtpRecord(next, { now }).ok, true);
});
