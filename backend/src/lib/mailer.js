import nodemailer from "nodemailer";
import { logger } from "./logger.js";

let transporter = null;

const brevoApiKey = () => String(process.env.BREVO_API_KEY || process.env.SMTP_API_KEY || "").trim();

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

const parseSender = (from) => {
  const raw = String(from || "").trim();
  const angled = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (angled) {
    const name = angled[1].trim();
    return { name: name || undefined, email: angled[2].trim() };
  }
  return { email: raw };
};

const getTransporter = () => {
  if (!smtpConfigured()) return null;
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && port === 587,
    family: 4,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
};

const sendViaBrevoHttp = async ({ to, subject, text, html }) => {
  const apiKey = brevoApiKey();
  const sender = parseSender(process.env.SMTP_FROM);
  if (!sender.email) throw new Error("SMTP_FROM is not configured");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error("[password-otp] Brevo API send failed", response.status, detail.slice(0, 300));
    throw new Error("Failed to send OTP email");
  }
};

export async function sendPasswordOtpEmail({ to, purpose, otp, expiresMinutes = 10 }) {
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

  if (process.env.NODE_ENV === "test") return { sent: false, skipped: "test" };

  if (brevoApiKey()) {
    await sendViaBrevoHttp({ to, subject, text, html });
    return { sent: true, via: "brevo-http" };
  }

  const mailer = getTransporter();
  if (!mailer) {
    if (process.env.NODE_ENV !== "production") {
      logger.debug("[password-otp] email skipped (SMTP not configured)", { purpose, hasRecipient: Boolean(to) });
      return { sent: false, skipped: "no-smtp" };
    }
    throw new Error("SMTP is not configured");
  }

  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    logger.error("[password-otp] SMTP send failed", error?.code || error?.message);
    throw error;
  }
  return { sent: true, via: "smtp" };
}

export const __resetMailerForTests = () => {
  transporter = null;
};
