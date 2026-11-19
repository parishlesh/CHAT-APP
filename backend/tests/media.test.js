import test from "node:test";
import assert from "node:assert/strict";
import cloudinary from "../src/lib/cloudinary.js";
import { AppError } from "../src/lib/errors.js";
import { MEDIA_LIMITS, createUploadSignature, mediaFolder, validateAttachment } from "../src/lib/media.js";

const userId = "507f1f77bcf86cd799439011";
const otherId = "507f1f77bcf86cd799439012";
const cloudName = "vibe-test";
const goodVideo = {
  kind: "video",
  url: `https://res.cloudinary.com/${cloudName}/video/upload/v1/${mediaFolder(userId)}/clip.mp4`,
  publicId: `${mediaFolder(userId)}/clip`,
  bytes: 1024,
  name: "C:\\Users\\me\\clip<script>.mp4",
  duration: 12.5,
};

test("accepts media uploaded into the sender's own folder", () => {
  const attachment = validateAttachment(goodVideo, { userId, cloudName });
  assert.equal(attachment.kind, "video");
  assert.equal(attachment.resourceType, "video");
  assert.equal(attachment.name, "clipscript.mp4");
  assert.equal(attachment.duration, 12.5);
});

test("voice notes are stored as Cloudinary video resources and files as raw", () => {
  const audio = validateAttachment({
    kind: "audio",
    url: `https://res.cloudinary.com/${cloudName}/video/upload/v1/${mediaFolder(userId)}/note.webm`,
    publicId: `${mediaFolder(userId)}/note`,
  }, { userId, cloudName });
  assert.equal(audio.resourceType, "video");
  const file = validateAttachment({
    kind: "file",
    url: `https://res.cloudinary.com/${cloudName}/raw/upload/v1/${mediaFolder(userId)}/report.pdf`,
    publicId: `${mediaFolder(userId)}/report.pdf`,
  }, { userId, cloudName });
  assert.equal(file.resourceType, "raw");
});

test("rejects media from another user's folder, another host, or another account", () => {
  assert.throws(() => validateAttachment({ ...goodVideo, publicId: `${mediaFolder(otherId)}/clip` }, { userId, cloudName }), AppError);
  assert.throws(() => validateAttachment({ ...goodVideo, url: "https://evil.example/video/upload/clip.mp4" }, { userId, cloudName }), AppError);
  assert.throws(() => validateAttachment(goodVideo, { userId, cloudName: "someone-else" }), AppError);
  assert.throws(() => validateAttachment({ ...goodVideo, kind: "image" }, { userId, cloudName }), AppError);
  assert.throws(() => validateAttachment({ ...goodVideo, kind: "exe" }, { userId, cloudName }), AppError);
});

test("rejects attachments over the size limit", () => {
  assert.throws(() => validateAttachment({ ...goodVideo, bytes: MEDIA_LIMITS.video + 1 }, { userId, cloudName }), AppError);
});

test("upload signatures pin the folder to the requesting user", () => {
  cloudinary.config({ cloud_name: cloudName, api_key: "key", api_secret: "secret" });
  const signature = createUploadSignature(userId, "image", { now: 1_700_000_000_000 });
  assert.equal(signature.folder, mediaFolder(userId));
  assert.equal(signature.resourceType, "image");
  assert.equal(signature.signature, cloudinary.utils.api_sign_request({ folder: signature.folder, timestamp: signature.timestamp }, "secret"));
  assert.throws(() => createUploadSignature(userId, "exe"), AppError);
});
