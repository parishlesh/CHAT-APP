import rateLimit from "express-rate-limit";

const windowMs = 15 * 60 * 1000;

export const authLimiter = rateLimit({
  windowMs,
  max: 20,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many searches. Please slow down." },
});

export const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You are sending messages too quickly." },
});

export const otpRequestLimiter = rateLimit({
  windowMs,
  max: 8,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP requests" },
});

export const otpVerifyLimiter = rateLimit({
  windowMs,
  max: 15,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts" },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});
