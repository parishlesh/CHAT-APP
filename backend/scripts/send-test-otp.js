import dotenv from "dotenv";
import { describeBrevoKey, getBrevoApiKey, parseSender, sendPasswordOtpEmail } from "../src/lib/mailer.js";

dotenv.config();

const sender = parseSender(process.env.SMTP_FROM);
const to = process.argv[2] || sender.email;
const keyKind = describeBrevoKey(getBrevoApiKey());

if (!to) {
  console.error("No recipient. Set SMTP_FROM or pass an email argument.");
  process.exit(1);
}

console.log(`Probing OTP mail via ${keyKind === "api-key" ? "Brevo HTTPS API" : "SMTP fallback"}`);
console.log(`Recipient: ${to}`);
console.log(`Sender: ${sender.email || "(missing)"}`);

try {
  const result = await sendPasswordOtpEmail({
    to,
    purpose: "PASSWORD_RESET",
    otp: "847291",
    expiresMinutes: 10,
  });
  console.log("Send result:", result);
  if (!result.sent) {
    process.exit(2);
  }
} catch (error) {
  console.error("Send failed:", error.message);
  process.exit(1);
}
