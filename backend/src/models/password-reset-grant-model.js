import mongoose from "mongoose";
import { OTP_PURPOSES } from "../lib/password-otp.js";

const passwordResetGrantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    purpose: {
      type: String,
      enum: Object.values(OTP_PURPOSES),
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const PasswordResetGrant = mongoose.model("PasswordResetGrant", passwordResetGrantSchema);

export default PasswordResetGrant;
