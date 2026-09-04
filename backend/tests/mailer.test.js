import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOtpMessage,
  describeBrevoKey,
  parseSender,
  sendPasswordOtpEmail,
  sendViaBrevoHttp,
} from "../src/lib/mailer.js";

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

test("sender parsing supports Brevo display-name format", () => {
  assert.deepEqual(parseSender("VibeLink <owner@example.com>"), { name: "VibeLink", email: "owner@example.com" });
  assert.deepEqual(parseSender("owner@example.com"), { email: "owner@example.com" });
});

test("Brevo SMTP keys are rejected as API keys", () => {
  assert.equal(describeBrevoKey("xsmtpsib-secret"), "smtp-key");
  assert.equal(describeBrevoKey("xkeysib-secret"), "api-key");
  assert.equal(describeBrevoKey(""), "missing");
});

test("OTP mail body includes the code and expiry", () => {
  const message = buildOtpMessage({ purpose: "PASSWORD_RESET", otp: "847291", expiresMinutes: 10 });
  assert.match(message.subject, /reset code/i);
  assert.match(message.text, /847291/);
  assert.match(message.html, /<strong>847291<\/strong>/);
});

test("Brevo HTTP send posts transactional JSON to the free API", async () => {
  const previous = {
    key: process.env.BREVO_API_KEY,
    from: process.env.SMTP_FROM,
    env: process.env.NODE_ENV,
    underTest: process.env.MAILER_UNDER_TEST,
  };
  process.env.NODE_ENV = "production";
  process.env.MAILER_UNDER_TEST = "1";
  process.env.BREVO_API_KEY = "xkeysib-unit-test";
  process.env.SMTP_FROM = "VibeLink <owner@example.com>";

  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return jsonResponse(201, { messageId: "<test>" });
  };

  const result = await sendPasswordOtpEmail({
    to: "user@example.com",
    purpose: "PASSWORD_RESET",
    otp: "847291",
    fetchImpl,
  });

  const body = JSON.parse(captured.options.body);
  assert.equal(result.sent, true);
  assert.equal(result.via, "brevo-http");
  assert.equal(captured.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(captured.options.headers["api-key"], "xkeysib-unit-test");
  assert.equal(body.sender.email, "owner@example.com");
  assert.equal(body.to[0].email, "user@example.com");
  assert.equal(body.textContent.includes("847291"), true);
  assert.deepEqual(body.tags, ["vibelink", "password-otp"]);

  process.env.BREVO_API_KEY = previous.key;
  process.env.SMTP_FROM = previous.from;
  process.env.NODE_ENV = previous.env;
  process.env.MAILER_UNDER_TEST = previous.underTest;
});

test("SMTP relay key cannot be used with the Brevo HTTP API", async () => {
  process.env.MAILER_UNDER_TEST = "1";
  process.env.BREVO_API_KEY = "xsmtpsib-not-an-api-key";
  process.env.SMTP_FROM = "owner@example.com";
  await assert.rejects(
    () => sendViaBrevoHttp({
      to: "user@example.com",
      subject: "test",
      text: "test",
      html: "<p>test</p>",
      fetchImpl: async () => jsonResponse(201, {}),
    }),
    /not an API key/
  );
});

test("Brevo 401 is surfaced as a send failure", async () => {
  process.env.MAILER_UNDER_TEST = "1";
  process.env.BREVO_API_KEY = "xkeysib-wrong";
  process.env.SMTP_FROM = "owner@example.com";
  await assert.rejects(
    () => sendViaBrevoHttp({
      to: "user@example.com",
      subject: "test",
      text: "test",
      html: "<p>test</p>",
      fetchImpl: async () => jsonResponse(401, { message: "Key not found", code: "unauthorized" }),
    }),
    /Failed to send OTP email/
  );
});
