import mongoose from "mongoose";
import { OTP_PURPOSES } from "../lib/password-otp.js";

const passwordResetOtpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: Object.values(OTP_PURPOSES),
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    requestIp: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

passwordResetOtpSchema.index({ userId: 1, purpose: 1, createdAt: -1 });

const PasswordResetOtp = mongoose.model("PasswordResetOtp", passwordResetOtpSchema);

export default PasswordResetOtp;
