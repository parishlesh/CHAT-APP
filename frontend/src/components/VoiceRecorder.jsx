/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Send, Trash2 } from "lucide-react";
import { AUDIO_MIME_CANDIDATES, MAX_VOICE_SECONDS, extensionForMime, formatDuration, pickRecorderMime } from "../lib/media";

// Inline voice-note recorder: starts on mount, shows a live level meter, and hands back a File.
const VoiceRecorder = ({ onCancel, onSend, onActivity }) => {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const sendOnStop = useRef(false);
  const startedAt = useRef(0);
  const pausedTotal = useRef(0);
  const pausedAt = useRef(0);
  const rafRef = useRef(0);
  const audioCtxRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [levels, setLevels] = useState(() => Array(24).fill(0.08));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let tick;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Voice notes aren't supported in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const mimeType = pickRecorderMime(AUDIO_MIME_CANDIDATES);
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          if (!sendOnStop.current) return;
          const type = recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          const seconds = (Date.now() - startedAt.current - pausedTotal.current) / 1000;
          if (blob.size && seconds >= 0.5) {
            onSend(new File([blob], `voice-${Date.now()}.${extensionForMime(type)}`, { type: type.split(";")[0] }), seconds);
          } else {
            onCancel();
          }
        };
        recorderRef.current = recorder;
        recorder.start(500);
        startedAt.current = Date.now();
        onActivity?.();

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const draw = () => {
            analyser.getByteFrequencyData(data);
            const level = data.reduce((sum, value) => sum + value, 0) / (data.length * 255);
            setLevels((prev) => [...prev.slice(1), Math.max(0.08, Math.min(1, level * 2.2))]);
            rafRef.current = requestAnimationFrame(draw);
          };
          draw();
        }

        let lastPing = Date.now();
        tick = setInterval(() => {
          if (recorder.state !== "recording") return;
          const seconds = (Date.now() - startedAt.current - pausedTotal.current) / 1000;
          setElapsed(seconds);
          if (Date.now() - lastPing > 2500) {
            lastPing = Date.now();
            onActivity?.();
          }
          if (seconds >= MAX_VOICE_SECONDS) {
            sendOnStop.current = true;
            recorder.stop();
          }
        }, 200);
      } catch (micError) {
        setError(micError?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser's site settings."
          : "Couldn't start the microphone.");
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(tick);
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // Recording session is tied to mount; callbacks are read when it ends.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (send) => {
    sendOnStop.current = send;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (recorder.state === "paused") pausedTotal.current += Date.now() - pausedAt.current;
      recorder.stop();
    }
    if (!send) onCancel();
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      pausedAt.current = Date.now();
      setPaused(true);
    } else if (recorder.state === "paused") {
      pausedTotal.current += Date.now() - pausedAt.current;
      recorder.resume();
      setPaused(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-between gap-2 rounded-2xl bg-base-200 px-3 py-2 text-sm">
        <span className="text-error">{error}</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onCancel}>OK</button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-base-200 px-2 py-1.5" role="group" aria-label="Recording voice message">
      <button type="button" className="ui-press rounded-full p-2 text-error hover:bg-base-300" aria-label="Discard voice message" onClick={() => finish(false)}>
        <Trash2 size={18} />
      </button>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full bg-error ${paused ? "" : "animate-pulse"}`} aria-hidden="true" />
      <span className="w-11 shrink-0 text-sm tabular-nums">{formatDuration(elapsed)}</span>
      <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden="true">
        {levels.map((level, index) => (
          <span key={index} className="w-1 shrink-0 rounded-full bg-primary/70" style={{ height: `${Math.round(level * 100)}%` }} />
        ))}
      </div>
      <button type="button" className="ui-press rounded-full p-2 hover:bg-base-300" aria-label={paused ? "Resume recording" : "Pause recording"} onClick={togglePause}>
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      <button type="button" className="ui-press rounded-full bg-primary p-2 text-primary-content" aria-label="Send voice message" onClick={() => finish(true)}>
        <Send size={18} />
      </button>
    </div>
  );
};

export default VoiceRecorder;
