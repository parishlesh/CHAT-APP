import nodemailer from "nodemailer";
import { logger } from "./logger.js";
import { looksLikeEmail } from "./password-otp.js";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

let transporter = null;

export const normalizeSecret = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");

export const parseSender = (from) => {
  const raw = String(from || "").trim();
  const angled = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (angled) {
    const name = angled[1].trim();
    const email = angled[2].trim();
    return { ...(name ? { name } : {}), email };
  }
  return { email: raw };
};

export const describeBrevoKey = (key) => {
  const value = normalizeSecret(key);
  if (!value) return "missing";
  if (value.startsWith("xsmtpsib-")) return "smtp-key";
  if (value.startsWith("xkeysib-")) return "api-key";
  return "unknown";
};

export const getBrevoApiKey = () => normalizeSecret(process.env.BREVO_API_KEY || process.env.SMTP_API_KEY);

export const buildOtpMessage = ({ purpose, otp, expiresMinutes = 10 }) => {
  const subject = purpose === "PASSWORD_CHANGE"
    ? "Your VibeLink password change code"
    : "Your VibeLink password reset code";
  const text = [
    `Your VibeLink code is ${otp}.`,
    `The code expires in ${expiresMinutes} minutes.`,
    "If you did not request this, you can ignore this email.",
    "Never share this code. VibeLink will never ask for your password or encryption keys.",
  ].join("\n\n");
  const html = `<p>Your VibeLink code is <strong>${otp}</strong>.</p>
<p>The code expires in <strong>${expiresMinutes} minutes</strong>.</p>
<p>If you did not request this, you can ignore this email.</p>
<p>Never share this code. VibeLink will never ask for your password or encryption keys.</p>`;
  return { subject, text, html };
};

const smtpConfigured = () => Boolean(normalizeSecret(process.env.SMTP_HOST) && normalizeSecret(process.env.SMTP_FROM));

const getTransporter = () => {
  if (!smtpConfigured()) return null;
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  transporter = nodemailer.createTransport({
    host: normalizeSecret(process.env.SMTP_HOST),
    port,
    secure,
    requireTLS: !secure && port === 587,
    family: 4,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000,
    auth: process.env.SMTP_USER
      ? { user: normalizeSecret(process.env.SMTP_USER), pass: normalizeSecret(process.env.SMTP_PASS) }
      : undefined,
  });
  return transporter;
};

const brevoHeaders = (apiKey) => ({
  accept: "application/json",
  "content-type": "application/json",
  "api-key": apiKey,
});

const readErrorBody = async (response) => {
  const detail = await response.text().catch(() => "");
  return detail.slice(0, 300);
};

export async function sendViaBrevoHttp({ to, subject, text, html, fetchImpl = fetch }) {
  const apiKey = getBrevoApiKey();
  const sender = parseSender(process.env.SMTP_FROM);
  if (!looksLikeEmail(sender.email)) throw new Error("SMTP_FROM is not a verified sender email");
  if (!looksLikeEmail(to)) throw new Error("OTP recipient is not a valid email");
  if (!apiKey) throw new Error("BREVO_API_KEY is not configured");
  if (describeBrevoKey(apiKey) === "smtp-key") {
    logger.error("[password-otp] BREVO_API_KEY is the SMTP key; create an API key (xkeysib-) in Brevo → SMTP & API → API keys");
    throw new Error("BREVO_API_KEY is not an API key");
  }

  const response = await fetchImpl(BREVO_SEND_URL, {
    method: "POST",
    headers: brevoHeaders(apiKey),
    body: JSON.stringify({
      sender,
      replyTo: sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
      tags: ["vibelink", "password-otp"],
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    logger.error("[password-otp] Brevo API send failed", response.status, describeBrevoKey(apiKey), await readErrorBody(response));
    throw new Error("Failed to send OTP email");
  }
  return { sent: true, via: "brevo-http", status: response.status };
}

export async function sendViaSmtp({ to, subject, text, html }) {
  const mailer = getTransporter();
  if (!mailer) throw new Error("SMTP is not configured");
  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  return { sent: true, via: "smtp" };
}

export async function sendPasswordOtpEmail({ to, purpose, otp, expiresMinutes = 10, fetchImpl = fetch }) {
  const message = buildOtpMessage({ purpose, otp, expiresMinutes });

  if (process.env.NODE_ENV === "test" && process.env.MAILER_UNDER_TEST !== "1") {
    return { sent: false, skipped: "test" };
  }

  const apiKey = getBrevoApiKey();
  if (apiKey || process.env.NODE_ENV === "production") {
    return sendViaBrevoHttp({ to, ...message, fetchImpl });
  }

  if (!smtpConfigured()) {
    logger.debug("[password-otp] email skipped (SMTP not configured)", { purpose, hasRecipient: Boolean(to) });
    return { sent: false, skipped: "no-smtp" };
  }

  try {
    return await sendViaSmtp({ to, ...message });
  } catch (error) {
    logger.error("[password-otp] SMTP send failed", error?.code || error?.message);
    throw error;
  }
}

export const __resetMailerForTests = () => {
  transporter = null;
};
