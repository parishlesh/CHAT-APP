import express from "express";
import {
  checkAuth,
  checkUsername,
  login,
  logout,
  signup,
  updateProfile,
  updateEncryptionKey,
} from "../controllers/auth-controller.js";

import protectRoute from "../middleware/auth-middleware.js";
import { authLimiter } from "../middleware/rate-limit.js";

const router = express.Router();

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/logout", logout);

// Username availability
router.get("/check-username/:username", checkUsername);

// Protected
router.put("/update-profile", protectRoute, updateProfile);
router.put("/encryption-key", protectRoute, updateEncryptionKey);
router.get("/check", protectRoute, checkAuth);

export default router;