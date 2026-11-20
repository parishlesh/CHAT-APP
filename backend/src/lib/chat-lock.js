import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "./errors.js";

// Chat lock: a per-user PIN guards chats the user locked. Unlocking a chat issues a short-lived
// token that the client sends with requests for that chat; without it the server won't return
// the chat's messages, so the lock can't be bypassed from dev tools.

export const UNLOCK_HEADER = "x-chat-unlock";
export const UNLOCK_TTL_SEC = 15 * 60;
const PIN_PATTERN = /^\d{4,6}$/;

export const validatePin = (pin) => {
  const value = String(pin ?? "");
  if (!PIN_PATTERN.test(value)) throw new AppError(400, "PIN must be 4 to 6 digits.");
  return value;
};

export const hashPin = (pin) => bcrypt.hash(validatePin(pin), 10);

export const pinMatches = async (user, pin) => {
  if (!user?.chatLockPinHash || !PIN_PATTERN.test(String(pin ?? ""))) return false;
  return bcrypt.compare(String(pin), user.chatLockPinHash);
};

export const isLockedFor = (conversation, userId) =>
  Boolean(conversation?.lockedBy?.some((id) => String(id?._id ?? id) === String(userId)));

const secret = () => {
  if (!process.env.JWT_SECRET) throw new AppError(500, "Server is missing JWT_SECRET.");
  return `${process.env.JWT_SECRET}:chat-unlock`;
};

export const issueUnlockToken = (userId, conversationId) => {
  const token = jwt.sign({ uid: String(userId), cid: String(conversationId), typ: "chat-unlock" }, secret(), { expiresIn: UNLOCK_TTL_SEC });
  return { token, expiresAt: new Date(Date.now() + UNLOCK_TTL_SEC * 1000).toISOString() };
};

export const hasValidUnlock = (req, conversationId) => {
  const token = req.get?.(UNLOCK_HEADER) || req.headers?.[UNLOCK_HEADER];
  if (!token) return false;
  try {
    const claims = jwt.verify(String(token), secret());
    return claims.typ === "chat-unlock" && claims.uid === String(req.user._id) && claims.cid === String(conversationId);
  } catch {
    return false;
  }
};

// Throws 423 (Locked) unless the chat isn't locked for this user or the request carries a valid unlock token.
export const assertUnlocked = (req, conversation) => {
  if (!isLockedFor(conversation, req.user._id) || hasValidUnlock(req, conversation._id)) return;
  const error = new AppError(423, "This chat is locked.");
  error.code = "CHAT_LOCKED";
  throw error;
};

// "Delete chat" hides everything up to this moment for one user; the other person keeps their copy.
export const clearedAtFor = (conversation, userId) => {
  const map = conversation?.clearedAt;
  if (!map) return null;
  const value = typeof map.get === "function" ? map.get(String(userId)) : map[String(userId)];
  return value ? new Date(value) : null;
};
