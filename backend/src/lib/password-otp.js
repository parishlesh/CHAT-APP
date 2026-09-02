import crypto from "crypto";

export const OTP_PURPOSES = {
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  PASSWORD_RESET: "PASSWORD_RESET",
};

export const OTP_TTL_MS = 10 * 60 * 1000;
export const GRANT_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REQUESTS = 3;
export const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const GENERIC_OTP_SENT_MESSAGE =
  "If an account matches the information provided, an OTP has been sent to the registered email.";

export const isProductionEnv = (nodeEnv = process.env.NODE_ENV) => nodeEnv === "production";

export function generateOtp(nodeEnv = process.env.NODE_ENV) {
  if (!isProductionEnv(nodeEnv)) return "123456";
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function otpSecret() {
  return process.env.OTP_SECRET || process.env.JWT_SECRET || "vibelink-otp-dev-secret";
}

export function hashSecretValue(value, secret = otpSecret()) {
  return crypto.createHmac("sha256", secret).update(String(value), "utf8").digest("hex");
}

export function secretEquals(expectedHash, value, secret = otpSecret()) {
  if (typeof expectedHash !== "string" || !expectedHash) return false;
  const actual = hashSecretValue(value, secret);
  const left = Buffer.from(expectedHash, "hex");
  const right = Buffer.from(actual, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isOtpFormat(otp) {
  return typeof otp === "string" && /^\d{6}$/.test(otp);
}

export function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function evaluateRequestRate(recentCount, max = OTP_MAX_REQUESTS) {
  if (Number(recentCount) >= max) return { ok: false, code: "too_many_requests" };
  return { ok: true };
}

export function evaluateOtpRecord(record, { now = new Date(), maxAttempts = OTP_MAX_ATTEMPTS } = {}) {
  if (!record) return { ok: false, code: "invalid" };
  if (record.consumedAt) return { ok: false, code: "reused" };
  if (new Date(record.expiresAt).getTime() <= now.getTime()) return { ok: false, code: "expired" };
  if (Number(record.attempts || 0) >= maxAttempts) return { ok: false, code: "too_many_attempts" };
  return { ok: true };
}

export function evaluateGrant(grant, { now = new Date(), purpose } = {}) {
  if (!grant) return { ok: false, code: "invalid_grant" };
  if (grant.consumedAt) return { ok: false, code: "grant_reused" };
  if (new Date(grant.expiresAt).getTime() <= now.getTime()) return { ok: false, code: "grant_expired" };
  if (purpose && grant.purpose !== purpose) return { ok: false, code: "purpose_mismatch" };
  return { ok: true };
}

export function createGrantToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function otpErrorMessage(code) {
  switch (code) {
    case "expired":
      return "OTP expired";
    case "too_many_attempts":
      return "Too many attempts";
    case "too_many_requests":
      return "Too many OTP requests";
    case "reused":
      return "Invalid OTP";
    case "grant_reused":
    case "grant_expired":
    case "invalid_grant":
    case "purpose_mismatch":
      return "Reset session expired";
    default:
      return "Invalid OTP";
  }
}

export function passwordErrorMessage(code) {
  switch (code) {
    case "identity-mismatch":
      return "Unable to update encryption backup";
    case "invalid-password":
      return "Password does not meet requirements";
    default:
      return "Unable to update encryption backup";
  }
}
