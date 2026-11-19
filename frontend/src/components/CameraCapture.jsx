/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Circle, RefreshCw, RotateCcw, Square, Video, X, Check } from "lucide-react";
import { VIDEO_MIME_CANDIDATES, canUseCamera, extensionForMime, formatDuration, pickRecorderMime } from "../lib/media";

const MAX_CAMERA_VIDEO_SECONDS = 60;

// Full-screen camera: take a photo or record a short video, preview it, then hand the file back.
// Needs HTTPS (or localhost); otherwise we fall back to the phone's own camera app via <input capture>.
const CameraCapture = ({ onClose, onCapture }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fallbackRef = useRef(null);
  const [facing, setFacing] = useState("user");
  const [mode, setMode] = useState("photo");
  const [error, setError] = useState(canUseCamera() ? "" : "Live camera needs a secure (HTTPS) connection in this browser.");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [captured, setCaptured] = useState(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!canUseCamera() || captured) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
        } catch (firstError) {
          if (firstError?.name === "NotAllowedError") throw firstError;
          // Some devices have no mic or refuse the combo; photos still work without audio.
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError("");
      } catch (cameraError) {
        if (cancelled) return;
        setError(cameraError?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser's site settings, or use your device camera instead."
          : "Couldn't start the camera on this device.");
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing, captured, stopStream]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopStream();
  }, [stopStream]);

  useEffect(() => () => { if (captured?.url) URL.revokeObjectURL(captured.url); }, [captured]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (facing === "user") {
      // Match the mirrored preview so the photo looks like what the user saw.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopStream();
      setCaptured({ file, url: URL.createObjectURL(file), kind: "image" });
    }, "image/jpeg", 0.88);
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("Video recording isn't supported in this browser.");
      return;
    }
    const mimeType = pickRecorderMime(VIDEO_MIME_CANDIDATES);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_000_000 } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (!blob.size) return;
      const file = new File([blob], `video-${Date.now()}.${extensionForMime(type)}`, { type: type.split(";")[0] });
      stopStream();
      setCaptured({ file, url: URL.createObjectURL(file), kind: "video" });
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
    setElapsed(0);
    const started = Date.now();
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_CAMERA_VIDEO_SECONDS) stopRecording();
    }, 250);
  };

  const retake = () => {
    setCaptured(null);
    setElapsed(0);
  };

  const confirm = () => {
    if (!captured) return;
    onCapture(captured.file);
    setCaptured(null);
    onClose();
  };

  const onFallbackPick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onCapture(file);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-label="Camera">
      <div className="flex items-center justify-between p-3 safe-top">
        <button type="button" className="rounded-full p-2 hover:bg-white/10" aria-label="Close camera" onClick={onClose}><X /></button>
        {recording && (
          <span className="flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-sm tabular-nums">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {formatDuration(elapsed)} / {formatDuration(MAX_CAMERA_VIDEO_SECONDS)}
          </span>
        )}
        {!captured && !error && (
          <button
            type="button"
            className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40"
            aria-label="Switch camera"
            disabled={recording}
            onClick={() => setFacing((value) => (value === "user" ? "environment" : "user"))}
          >
            <RefreshCw />
          </button>
        )}
        {(captured || error) && <span className="w-10" />}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {captured ? (
          captured.kind === "image"
            ? <img src={captured.url} alt="Captured" className="max-h-full max-w-full object-contain" />
            : <video src={captured.url} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : error ? (
          <div className="max-w-sm space-y-4 p-6 text-center">
            <Camera className="mx-auto h-10 w-10 opacity-70" />
            <p className="text-sm opacity-80">{error}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fallbackRef.current?.click()}>
              Use device camera
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
          />
        )}
      </div>

      <input
        ref={fallbackRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={onFallbackPick}
      />

      <div className="flex flex-col items-center gap-3 p-4 safe-bottom">
        {captured ? (
          <div className="flex w-full max-w-xs items-center justify-between">
            <button type="button" className="flex items-center gap-2 rounded-full px-4 py-2 hover:bg-white/10" onClick={retake}>
              <RotateCcw size={18} /> Retake
            </button>
            <button type="button" className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-primary-content" onClick={confirm}>
              <Check size={18} /> Use {captured.kind === "image" ? "photo" : "video"}
            </button>
          </div>
        ) : !error && (
          <>
            <div className="flex rounded-full bg-white/10 p-1 text-xs">
              {[{ key: "photo", label: "Photo", Icon: Camera }, { key: "video", label: "Video", Icon: Video }].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={recording}
                  onClick={() => setMode(key)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 ${mode === key ? "bg-white text-black" : "opacity-80"}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            {mode === "photo" ? (
              <button type="button" aria-label="Take photo" onClick={takePhoto} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white">
                <Circle className="h-12 w-12 fill-white" />
              </button>
            ) : recording ? (
              <button type="button" aria-label="Stop recording" onClick={stopRecording} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white">
                <Square className="h-7 w-7 fill-red-600 text-red-600" />
              </button>
            ) : (
              <button type="button" aria-label="Start recording" onClick={startRecording} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white">
                <Circle className="h-12 w-12 fill-red-600 text-red-600" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;
