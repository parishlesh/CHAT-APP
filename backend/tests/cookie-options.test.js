import test from "node:test";
import assert from "node:assert/strict";
import { authCookieOptions } from "../src/lib/utils.js";

test("development cookies are host-only lax", () => {
  process.env.NODE_ENV = "development";
  delete process.env.COOKIE_SAMESITE;
  const options = authCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, false);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.partitioned, undefined);
});

test("production same-origin cookies use secure lax", () => {
  process.env.NODE_ENV = "production";
  delete process.env.COOKIE_SAMESITE;
  const options = authCookieOptions();
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.partitioned, undefined);
});

test("explicit cross-site cookies use none, secure, and partitioned", () => {
  process.env.NODE_ENV = "production";
  process.env.COOKIE_SAMESITE = "none";
  const options = authCookieOptions();
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "none");
  assert.equal(options.partitioned, true);
  delete process.env.COOKIE_SAMESITE;
});
