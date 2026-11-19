import axios from "axios";
import { axiosInstance } from "./axios";

// Client side of lib/media.js on the backend: ask the API for a signed, per-user upload slot,
// then send the file straight to Cloudinary so big videos never go through our server.

export const MEDIA_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
  file: 10 * 1024 * 1024,
};

export const MAX_VIDEO_SECONDS = 3 * 60;
export const MAX_VOICE_SECONDS = 5 * 60;

export const kindForFile = (file) => {
  const type = file?.type || "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
};

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
};

export const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

export const mediaLabel = (attachment) => {
  if (!attachment) return "";
  if (attachment.kind === "image") return "📷 Photo";
  if (attachment.kind === "video") return "🎥 Video";
  if (attachment.kind === "audio") return "🎤 Voice message";
  return `📄 ${attachment.name || "File"}`;
};

// Old messages only have `image`; newer ones have `attachment`. Treat both the same in the UI.
export const mediaOf = (message) => {
  if (message?.attachment?.url) return message.attachment;
  if (message?.image) return { kind: "image", url: message.image };
  return null;
};

export const validateFileForUpload = (file, kind = kindForFile(file)) => {
  if (!file) return "No file selected.";
  if (file.size > MEDIA_LIMITS[kind]) {
    return `${kind === "file" ? "Files" : `${kind[0].toUpperCase()}${kind.slice(1)}s`} can be up to ${formatBytes(MEDIA_LIMITS[kind])}.`;
  }
  return null;
};

// Downscale large photos before upload (GIFs are left alone so they keep animating).
export const compressPhoto = (file, maxSide = 1600, quality = 0.82) => new Promise((resolve, reject) => {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    resolve(file);
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("This image format isn't supported by your browser."));
  };
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      resolve(file);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return resolve(file);
      resolve(new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
    }, "image/jpeg", quality);
  };
  img.src = url;
});

// Reads duration/size so the bubble can show "0:12" before the video loads.
export const probeMedia = (file, kind) => new Promise((resolve) => {
  if (kind !== "video" && kind !== "audio" && kind !== "image") return resolve({});
  const url = URL.createObjectURL(file);
  let settled = false;
  const done = (meta) => {
    if (settled) return;
    settled = true;
    URL.revokeObjectURL(url);
    resolve(meta);
  };
  if (kind === "image") {
    const img = new Image();
    img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done({});
    img.src = url;
    return;
  }
  const el = document.createElement(kind);
  el.preload = "metadata";
  el.onloadedmetadata = () => done({
    duration: Number.isFinite(el.duration) ? el.duration : null,
    width: el.videoWidth || null,
    height: el.videoHeight || null,
  });
  el.onerror = () => done({});
  el.src = url;
  setTimeout(() => done({}), 4000);
});

export async function uploadMedia(file, { kind = kindForFile(file), onProgress, signal, meta = {} } = {}) {
  const problem = validateFileForUpload(file, kind);
  if (problem) throw new Error(problem);
  const { data: slot } = await axiosInstance.post("/messages/media/signature", { kind }, { signal });
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", slot.apiKey);
  form.append("timestamp", String(slot.timestamp));
  form.append("folder", slot.folder);
  form.append("signature", slot.signature);
  const { data } = await axios.post(
    `https://api.cloudinary.com/v1_1/${slot.cloudName}/${slot.resourceType}/upload`,
    form,
    {
      signal,
      withCredentials: false,
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
      },
    },
  );
  return {
    kind,
    url: data.secure_url,
    publicId: data.public_id,
    name: file.name || data.original_filename || "",
    mime: file.type || "",
    bytes: data.bytes ?? file.size,
    width: data.width ?? meta.width ?? null,
    height: data.height ?? meta.height ?? null,
    duration: data.duration ?? meta.duration ?? null,
  };
}

// Pick a recording format the browser actually supports (Safari can't do webm).
export const pickRecorderMime = (candidates) => {
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
};

export const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
export const VIDEO_MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

export const extensionForMime = (mime) => (mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm");

export const canUseCamera = () => Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

// A download link that keeps the original name; Cloudinary honours fl_attachment for image/video.
export const downloadUrl = (attachment) => {
  if (!attachment?.url) return "";
  if (attachment.kind === "file" || attachment.kind === "audio") return attachment.url;
  return attachment.url.replace("/upload/", "/upload/fl_attachment/");
};
