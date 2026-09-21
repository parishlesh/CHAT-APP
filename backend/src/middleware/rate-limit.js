import rateLimit from "express-rate-limit";
import { OptionalRedisStore } from "../lib/rate-limit-store.js";

const windowMs = 15 * 60 * 1000;

const limiter = (options, prefix) => rateLimit({
  ...options,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  store: new OptionalRedisStore({ prefix }),
});

export const authLimiter = limiter({
  windowMs,
  max: 20,
  message: { message: "Too many attempts. Please try again later." },
}, "vl:rl:auth:");

export const searchLimiter = limiter({
  windowMs: 60 * 1000,
  max: 40,
  message: { message: "Too many searches. Please slow down." },
}, "vl:rl:search:");

export const sendLimiter = limiter({
  windowMs: 60 * 1000,
  max: 90,
  message: { message: "You are sending messages too quickly." },
}, "vl:rl:send:");

export const otpRequestLimiter = limiter({
  windowMs,
  max: 8,
  message: { message: "Too many OTP requests" },
}, "vl:rl:otp-request:");

export const otpVerifyLimiter = limiter({
  windowMs,
  max: 15,
  message: { message: "Too many attempts" },
}, "vl:rl:otp-verify:");

export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  max: 300,
  message: { message: "Too many requests. Please slow down." },
}, "vl:rl:api:");
