import mongoose from "mongoose";
import { AppError } from "./errors.js";

export const MAX_IMAGE_CHARS = 8 * 1024 * 1024;
export const MAX_MESSAGE_CHARS = 20000;
const IMAGE_PREFIX = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i;

export function isObjectId(value) {
  return Boolean(value) && mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === String(value);
}

export function requireObjectId(value, label = "id") {
  if (!isObjectId(value)) throw new AppError(400, `Invalid ${label}.`);
  return value;
}

export function sanitizeQuery(value, max = 80) {
  return String(value || "").trim().slice(0, max);
}

export function validateImageDataUrl(image) {
  if (!image) return null;
  if (typeof image !== "string") throw new AppError(400, "Invalid image.");
  if (image.length > MAX_IMAGE_CHARS) throw new AppError(400, "Image is too large.");
  if (!IMAGE_PREFIX.test(image)) throw new AppError(400, "Image must be a JPEG, PNG, WebP, or GIF.");
  return image;
}

export function validateMessageText(text) {
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length > MAX_MESSAGE_CHARS) throw new AppError(400, "Message is too long.");
  return value;
}

export function validateExpiresAt(expiresAt) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
    throw new AppError(400, "Expiration must be a future date.");
  }
  const max = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (expiry > max) throw new AppError(400, "Expiration is too far in the future.");
  return expiry;
}
