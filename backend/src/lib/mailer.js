import nodemailer from "nodemailer";
import { logger } from "./logger.js";

let transporter = null;

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

const getTransporter = () => {
  if (!smtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
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

  if (process.env.NODE_ENV === "test") return { sent: false, skipped: "test" };

  const mailer = getTransporter();
  if (!mailer) {
    if (process.env.NODE_ENV !== "production") {
      logger.debug("[password-otp] email skipped (SMTP not configured)", { purpose, hasRecipient: Boolean(to) });
      return { sent: false, skipped: "no-smtp" };
    }
    throw new Error("SMTP is not configured");
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html: `<p>Your VibeLink code is <strong>${otp}</strong>.</p>
<p>The code expires in <strong>${expiresMinutes} minutes</strong>.</p>
<p>If you did not request this, you can ignore this email.</p>
<p>Never share this code. VibeLink will never ask for your password or encryption keys.</p>`,
  });
  return { sent: true };
}

export const __resetMailerForTests = () => {
  transporter = null;
};
