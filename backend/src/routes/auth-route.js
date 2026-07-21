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

const router = express.Router();

// Authentication
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

// Username availability
router.get("/check-username/:username", checkUsername);

// Protected
router.put("/update-profile", protectRoute, updateProfile);
router.put("/encryption-key", protectRoute, updateEncryptionKey);
router.get("/check", protectRoute, checkAuth);

export default router;