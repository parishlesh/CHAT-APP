import bcrypt from "bcryptjs";
import User from "../models/user-model.js";
import PasswordResetOtp from "../models/password-reset-otp-model.js";
import PasswordResetGrant from "../models/password-reset-grant-model.js";
import { sendPasswordOtpEmail } from "../lib/mailer.js";
import { logger } from "../lib/logger.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { authCookieOptions } from "../lib/utils.js";
import { disconnectUserSockets } from "../lib/socket.js";
import { planPasswordEncryptionUpdate } from "./auth-controller.js";
import {
  GENERIC_OTP_SENT_MESSAGE,
  GRANT_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_PURPOSES,
  OTP_REQUEST_WINDOW_MS,
  OTP_TTL_MS,
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
  otpSecret,
  passwordErrorMessage,
  secretEquals,
} from "../lib/password-otp.js";

const sanitizePublicKey = (jwk) => {
  if (!jwk || typeof jwk !== "object" || jwk.d || jwk.privateKey) return null;
  if (jwk.kty !== "EC" || !jwk.crv || typeof jwk.x !== "string" || typeof jwk.y !== "string") return null;
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
};

const sanitizeKeyBackup = (backup) => {
  if (!backup || typeof backup !== "object" || backup.d || backup.privateKey) return null;
  const v = Number(backup.v);
  const { salt, iv, ciphertext } = backup;
  if (v !== 1 || typeof salt !== "string" || typeof iv !== "string" || typeof ciphertext !== "string") return null;
  if (!salt || !iv || !ciphertext) return null;
  return { v: 1, salt, iv, ciphertext };
};

const publicKeyFingerprint = (jwk) => {
  const key = sanitizePublicKey(jwk);
  if (!key) return "";
  const normalize = (value) => String(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${normalize(key.x)}.${normalize(key.y)}`;
};

const requestIp = (req) => String(req.ip || req.headers["x-forwarded-for"] || "").slice(0, 120);

const resolveUserByIdentifier = async (identifier) => {
  const value = normalizeIdentifier(identifier);
  if (!value) return null;
  if (looksLikeEmail(value)) return User.findOne({ email: value });
  return User.findOne({ username: value });
};

const issueOtpForUser = async ({ user, purpose, ip }) => {
  const recentCount = await PasswordResetOtp.countDocuments({
    userId: user._id,
    purpose,
    createdAt: { $gt: new Date(Date.now() - OTP_REQUEST_WINDOW_MS) },
  });
  const rate = evaluateRequestRate(recentCount);
  if (!rate.ok) throw new AppError(429, otpErrorMessage(rate.code));

  await PasswordResetOtp.updateMany(
    { userId: user._id, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );
  await PasswordResetGrant.updateMany(
    { userId: user._id, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

  const otp = generateOtp();
  await PasswordResetOtp.create({
    userId: user._id,
    otpHash: hashSecretValue(otp, otpSecret()),
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    requestIp: ip,
  });

  logger.debug("[password-otp] requested", {
    purpose,
    userId: String(user._id),
    keyId: publicKeyFingerprint(user.encryptionPublicKey).slice(0, 24) || null,
  });

  await sendPasswordOtpEmail({
    to: user.email,
    purpose,
    otp,
    expiresMinutes: Math.round(OTP_TTL_MS / 60000),
  });
};

export const requestPasswordOtp = asyncHandler(async (req, res) => {
  const purpose = req.body?.purpose === OTP_PURPOSES.PASSWORD_CHANGE
    ? OTP_PURPOSES.PASSWORD_CHANGE
    : OTP_PURPOSES.PASSWORD_RESET;
  const ip = requestIp(req);

  if (purpose === OTP_PURPOSES.PASSWORD_CHANGE) {
    if (!req.user?._id) throw new AppError(401, "Unauthorized.");
    const user = await User.findById(req.user._id);
    if (!user) throw new AppError(401, "Unauthorized.");
    await issueOtpForUser({ user, purpose, ip });
    return res.status(200).json({ message: "If this account can receive mail, an OTP has been sent to the registered email." });
  }

  const identifier = normalizeIdentifier(req.body?.identifier || req.body?.email || req.body?.username);
  if (!identifier) {
    return res.status(200).json({ message: GENERIC_OTP_SENT_MESSAGE });
  }

  const user = await resolveUserByIdentifier(identifier);
  if (user) {
    try {
      await issueOtpForUser({ user, purpose, ip });
    } catch (error) {
      if (error instanceof AppError && error.status === 429) throw error;
      logger.error("[password-otp] request failed", { purpose, reason: error?.code || error?.message });
    }
  }

  return res.status(200).json({ message: GENERIC_OTP_SENT_MESSAGE });
});

export const verifyPasswordOtp = asyncHandler(async (req, res) => {
  const purpose = req.body?.purpose === OTP_PURPOSES.PASSWORD_CHANGE
    ? OTP_PURPOSES.PASSWORD_CHANGE
    : OTP_PURPOSES.PASSWORD_RESET;
  const otp = String(req.body?.otp || "");
  if (!isOtpFormat(otp)) throw new AppError(400, otpErrorMessage("invalid"));

  let user = null;
  if (purpose === OTP_PURPOSES.PASSWORD_CHANGE) {
    if (!req.user?._id) throw new AppError(401, "Unauthorized.");
    user = await User.findById(req.user._id);
  } else {
    user = await resolveUserByIdentifier(req.body?.identifier || req.body?.email || req.body?.username);
  }
  if (!user) throw new AppError(400, otpErrorMessage("invalid"));

  const record = await PasswordResetOtp.findOne({
    userId: user._id,
    purpose,
  }).sort({ createdAt: -1 });

  const state = evaluateOtpRecord(record);
  if (!state.ok) {
    if (record && state.code === "invalid") {
      await PasswordResetOtp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    }
    throw new AppError(400, otpErrorMessage(state.code));
  }

  const matches = secretEquals(record.otpHash, otp, otpSecret());
  if (!matches) {
    const updated = await PasswordResetOtp.findByIdAndUpdate(
      record._id,
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (Number(updated?.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      throw new AppError(400, otpErrorMessage("too_many_attempts"));
    }
    throw new AppError(400, otpErrorMessage("invalid"));
  }

  const consumed = await PasswordResetOtp.findOneAndUpdate(
    { _id: record._id, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );
  if (!consumed) throw new AppError(400, otpErrorMessage("reused"));

  const resetToken = createGrantToken();
  await PasswordResetGrant.create({
    userId: user._id,
    tokenHash: hashSecretValue(resetToken, otpSecret()),
    purpose,
    expiresAt: new Date(Date.now() + GRANT_TTL_MS),
  });

  logger.debug("[password-otp] verified", {
    purpose,
    userId: String(user._id),
    keyId: publicKeyFingerprint(user.encryptionPublicKey).slice(0, 24) || null,
  });

  res.status(200).json({
    resetToken,
    purpose,
    userId: String(user._id),
    keyId: publicKeyFingerprint(user.encryptionPublicKey).slice(0, 24) || null,
    hasPublicKey: Boolean(sanitizePublicKey(user.encryptionPublicKey)),
    hasWrappedBackup: Boolean(sanitizeKeyBackup(user.encryptionKeyBackup)),
  });
});

export const commitPasswordChange = asyncHandler(async (req, res) => {
  const resetToken = String(req.body?.resetToken || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!resetToken) throw new AppError(400, otpErrorMessage("invalid_grant"));
  if (newPassword.length < 6) throw new AppError(400, passwordErrorMessage("invalid-password"));

  const tokenHash = hashSecretValue(resetToken, otpSecret());
  const grant = await PasswordResetGrant.findOne({ tokenHash });
  const grantState = evaluateGrant(grant);
  if (!grantState.ok) throw new AppError(400, otpErrorMessage(grantState.code));

  if (grant.purpose === OTP_PURPOSES.PASSWORD_CHANGE) {
    if (!req.user?._id || String(req.user._id) !== String(grant.userId)) {
      throw new AppError(401, "Unauthorized.");
    }
  }

  const user = await User.findById(grant.userId);
  if (!user) throw new AppError(400, otpErrorMessage("invalid_grant"));

  logger.debug("[password-change] started", {
    purpose: grant.purpose,
    userId: String(user._id),
    keyId: publicKeyFingerprint(user.encryptionPublicKey).slice(0, 24) || null,
  });

  const incomingPublic = sanitizePublicKey(req.body?.encryptionPublicKey);
  const incomingBackup = sanitizeKeyBackup(req.body?.encryptionKeyBackup);
  if (req.body?.encryptionKeyBackup && !incomingBackup) {
    throw new AppError(400, passwordErrorMessage("identity-mismatch"));
  }

  const plan = planPasswordEncryptionUpdate(user, incomingPublic, incomingBackup);
  if (plan.action === "identity-mismatch") {
    throw new AppError(400, passwordErrorMessage("identity-mismatch"));
  }

  const e2eAvailable = plan.action === "rewrap";
  logger.debug("[password-change] e2e", {
    identityAvailable: e2eAvailable,
    action: plan.action,
    keyId: publicKeyFingerprint(user.encryptionPublicKey).slice(0, 24) || null,
  });

  const hashedPassword = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
  const claimedGrant = await PasswordResetGrant.findOneAndUpdate(
    { _id: grant._id, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );
  if (!claimedGrant) throw new AppError(400, otpErrorMessage("grant_reused"));

  let saved;
  try {
    saved = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          password: hashedPassword,
          ...plan.encryptionUpdate,
        },
        $inc: { tokenVersion: 1 },
      },
      { new: true }
    );
  } catch (error) {
    await PasswordResetGrant.findByIdAndUpdate(grant._id, { $set: { consumedAt: null } });
    throw error;
  }
  if (!saved) {
    await PasswordResetGrant.findByIdAndUpdate(grant._id, { $set: { consumedAt: null } });
    throw new AppError(500, "Unable to update encryption backup");
  }

  logger.debug("[password-change] committed", {
    purpose: grant.purpose,
    backupUpdated: plan.action === "rewrap",
    backupCleared: plan.action === "clear-unrecoverable-backup",
    keyId: publicKeyFingerprint(saved.encryptionPublicKey).slice(0, 24) || null,
  });

  disconnectUserSockets(user._id);
  res.cookie("jwt", "", authCookieOptions({ clearing: true }));
  logger.debug("[password-change] sessions invalidated", { userId: String(user._id) });

  res.status(200).json({
    message: "Password updated. Please sign in with your new password.",
    encryptionBackupUpdated: plan.action === "rewrap",
    encryptionIdentityPreserved: Boolean(sanitizePublicKey(saved.encryptionPublicKey)),
    encryptionRecoveryRequired: plan.action === "clear-unrecoverable-backup",
  });
});
