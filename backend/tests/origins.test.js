import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedOrigins, isOriginAllowed } from "../src/lib/origins.js";

test("development allows localhost and missing origin", () => {
  process.env.NODE_ENV = "development";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.FRONTEND_URL = "";
  assert.equal(isOriginAllowed(undefined), true);
  assert.equal(isOriginAllowed("http://localhost:5173"), true);
  assert.equal(isOriginAllowed("https://evil.example"), false);
});

test("production rejects unknown and missing origins", () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://chat.example.com/";
  process.env.FRONTEND_URL = "https://chat.example.com";
  assert.ok(getAllowedOrigins().includes("https://chat.example.com"));
  assert.equal(isOriginAllowed(undefined), false);
  assert.equal(isOriginAllowed("https://chat.example.com"), true);
  assert.equal(isOriginAllowed("https://chat.example.com/"), true);
  assert.equal(isOriginAllowed("https://evil.example"), false);
});

test("production vercel CLIENT_URL allows preview deployments", () => {
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "https://chat-app.vercel.app";
  process.env.FRONTEND_URL = "";
  assert.equal(isOriginAllowed("https://chat-app.vercel.app"), true);
  assert.equal(
    isOriginAllowed("https://chat-app-git-master-parishleshs-projects.vercel.app"),
    true,
  );
  assert.equal(isOriginAllowed("https://evil.example"), false);
});
