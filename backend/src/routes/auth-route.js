import express from "express";
import {
  checkAuth,
  checkUsername,
  login,
  logout,
  signup,
  updateProfile,
  updateEncryptionKey,
  getEncryptionKey,
  resetUnrecoverableEncryptionKey,
} from "../controllers/auth-controller.js";
import {
  commitPasswordChange,
  requestPasswordOtp,
  verifyPasswordOtp,
} from "../controllers/password-controller.js";

import protectRoute, { optionalAuth } from "../middleware/auth-middleware.js";
import { authLimiter, otpRequestLimiter, otpVerifyLimiter } from "../middleware/rate-limit.js";

const router = express.Router();

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/logout", logout);

router.post("/password/otp/request", otpRequestLimiter, optionalAuth, requestPasswordOtp);
router.post("/password/otp/verify", otpVerifyLimiter, optionalAuth, verifyPasswordOtp);
router.post("/password/change", authLimiter, optionalAuth, commitPasswordChange);

// Username availability
router.get("/check-username/:username", checkUsername);

// Protected
router.put("/update-profile", protectRoute, updateProfile);
router.put("/encryption-key", protectRoute, updateEncryptionKey);
router.post("/encryption-key/reset", protectRoute, resetUnrecoverableEncryptionKey);
router.get("/encryption-key", protectRoute, getEncryptionKey);
router.get("/check", protectRoute, checkAuth);

export default router;