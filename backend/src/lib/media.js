import cloudinary from "./cloudinary.js";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";

// Media is uploaded by the browser straight to Cloudinary with a short-lived signature,
// so large videos never pass through this API (which caps JSON bodies at 12 MB).
// The signature pins the upload folder to the sender, and sendMessage only accepts
// attachments that live in that folder on our own Cloudinary account.

export const MEDIA_KINDS = ["image", "video", "audio", "file"];

export const MEDIA_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
  file: 10 * 1024 * 1024,
};

const RESOURCE_TYPES = { image: "image", video: "video", audio: "video", file: "raw" };
const SIGNATURE_TTL_SEC = 10 * 60;

export const resourceTypeFor = (kind) => RESOURCE_TYPES[kind] || null;
export const mediaFolder = (userId) => `vibelink/${String(userId)}`;

export function createUploadSignature(userId, kind, { now = Date.now() } = {}) {
  if (!MEDIA_KINDS.includes(kind)) throw new AppError(400, "Unsupported attachment type.");
  const { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret } = cloudinary.config();
  if (!cloudName || !apiKey || !apiSecret) throw new AppError(503, "Media uploads aren't configured on this server.");
  const timestamp = Math.floor(now / 1000);
  const folder = mediaFolder(userId);
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, apiSecret);
  return {
    cloudName,
    apiKey,
    timestamp,
    folder,
    signature,
    resourceType: resourceTypeFor(kind),
    maxBytes: MEDIA_LIMITS[kind],
    expiresAt: new Date((timestamp + SIGNATURE_TTL_SEC) * 1000).toISOString(),
  };
}

const finiteOrNull = (value, max = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
};

const cleanName = (value) => String(value || "")
  .split(/[\\/]/).pop()
  .replace(/[\u0000-\u001f<>]/g, "")
  .trim()
  .slice(0, 120);

export function validateAttachment(input, { userId, cloudName = cloudinary.config().cloud_name } = {}) {
  if (!input) return null;
  if (typeof input !== "object") throw new AppError(400, "Invalid attachment.");
  const kind = String(input.kind || "");
  if (!MEDIA_KINDS.includes(kind)) throw new AppError(400, "Unsupported attachment type.");
  const resourceType = resourceTypeFor(kind);
  const url = String(input.url || "");
  const publicId = String(input.publicId || "");
  const folder = `${mediaFolder(userId)}/`;
  const expectedPrefix = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/`;

  if (!cloudName || !url.startsWith(expectedPrefix)) throw new AppError(400, "Attachment must be uploaded through VibeLink.");
  if (!publicId.startsWith(folder) || publicId.includes("..") || !url.includes(publicId)) {
    throw new AppError(400, "Attachment must be uploaded through VibeLink.");
  }
  const bytes = finiteOrNull(input.bytes);
  if (bytes != null && bytes > MEDIA_LIMITS[kind]) throw new AppError(400, "Attachment is too large.");

  return {
    kind,
    url,
    publicId,
    resourceType,
    name: cleanName(input.name) || (kind === "file" ? "File" : ""),
    mime: String(input.mime || "").slice(0, 100),
    bytes,
    width: finiteOrNull(input.width, 20000),
    height: finiteOrNull(input.height, 20000),
    duration: finiteOrNull(input.duration, 60 * 60),
  };
}

export async function destroyAttachment(attachment) {
  if (!attachment?.publicId) return;
  try {
    await cloudinary.uploader.destroy(attachment.publicId, { resource_type: attachment.resourceType || "image", invalidate: true });
  } catch (error) {
    logger.warn("Cloudinary destroy failed:", error.message);
  }
}
