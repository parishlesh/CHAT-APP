/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { Camera, FileText, Image as ImageIcon, Mic, Paperclip, Send, Smile, Timer, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";
import { isEncryptedText } from "../lib/encryption";
import { canComposeInConversation } from "../lib/conversationAccess";
import {
  compressPhoto, formatBytes, formatDuration, kindForFile, mediaLabel, probeMedia, uploadMedia, validateFileForUpload,
} from "../lib/media";
import CameraCapture from "./CameraCapture";
import VoiceRecorder from "./VoiceRecorder";
import EmojiPicker from "./EmojiPicker";

const TYPING_PING_MS = 2000;

const AttachmentPreview = ({ pending, progress, onRemove, onCancelUpload }) => {
  const { kind, url, file, meta } = pending;
  const uploading = progress != null;
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-base-300 bg-base-200 p-2">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-base-300">
        {kind === "image" && <img src={url} alt="Selected" className="h-full w-full object-cover" />}
        {kind === "video" && <video src={url} muted playsInline className="h-full w-full object-cover" />}
        {(kind === "file" || kind === "audio") && (
          <span className="flex h-full w-full items-center justify-center">{kind === "audio" ? <Mic /> : <FileText />}</span>
        )}
        {kind === "video" && meta?.duration != null && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[10px] text-white">{formatDuration(meta.duration)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{kind === "file" ? file.name : mediaLabel({ kind })}</p>
        <p className="text-xs text-base-content/60">{formatBytes(file.size)}{kind === "file" ? "" : " · add a caption below"}</p>
        {uploading && (
          <div className="mt-1.5 flex items-center gap-2">
            <progress className="progress progress-primary h-1.5 flex-1" value={progress} max="100" />
            <span className="w-9 text-right text-[11px] tabular-nums">{progress}%</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={uploading ? onCancelUpload : onRemove}
        className="shrink-0 rounded-full p-1.5 hover:bg-base-300"
        aria-label={uploading ? "Cancel upload" : "Remove attachment"}
      >
        <X size={16} />
      </button>
    </div>
  );
};

const MessageInput = () => {
  const [text, setText] = useState(() => {
    const { selectedUser: peer, drafts } = useChatStore.getState();
    return (peer && drafts[String(peer._id)]) || "";
  });
  const [pending, setPending] = useState(null); // { file, kind, url, meta }
  const [progress, setProgress] = useState(null);
  const [disappearing, setDisappearing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const {
    sendMessage, selectedUser, editingMessage, setEditingMessage, editMessage, replyingTo, setReplyingTo, sending,
    defaultDisappearing, conversationStatus, conversationInitiatedBy, setDraft, queuedFile, clearQueuedFile,
  } = useChatStore();
  const { socket, authUser } = useAuth();
  const mediaInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingPing = useRef(0);
  const textareaRef = useRef(null);
  const uploadAbort = useRef(null);
  const busy = sending || progress != null;

  const stopTyping = () => {
    clearTimeout(typingTimer.current);
    lastTypingPing.current = 0;
    if (selectedUser && socket) socket.emit("stopTyping", { to: selectedUser._id, conversationId: selectedUser._id });
  };

  const pingActivity = (activity = "typing") => {
    if (!selectedUser || !socket) return;
    const now = Date.now();
    if (now - lastTypingPing.current > TYPING_PING_MS) {
      lastTypingPing.current = now;
      socket.emit("typing", { to: selectedUser._id, conversationId: selectedUser._id, activity });
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, activity === "recording" ? 4000 : 2500);
  };

  const resizeField = () => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
  };

  const handleTyping = (value) => {
    setText(value);
    if (editingMessage) return;
    pingActivity("typing");
  };

  useEffect(() => () => stopTyping(), [selectedUser, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDisappearing(Boolean(defaultDisappearing));
  }, [selectedUser?._id, defaultDisappearing]);

  const clearPending = useCallback(() => {
    setPending((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  useEffect(() => {
    if (editingMessage) {
      if (editingMessage.decryptStatus === "pending" || editingMessage.decryptStatus === "failed") {
        setEditingMessage(null);
        return;
      }
      setText(editingMessage.displayText || "");
      clearPending();
      requestAnimationFrame(resizeField);
      textareaRef.current?.focus();
    }
  }, [editingMessage, setEditingMessage, clearPending]);

  useEffect(() => { resizeField(); }, [text]);

  // Keep an unsent draft per chat (not while editing an existing message).
  useEffect(() => {
    if (editingMessage || !selectedUser?._id) return;
    const timer = setTimeout(() => setDraft(selectedUser._id, text), 250);
    return () => clearTimeout(timer);
  }, [text, editingMessage, selectedUser?._id, setDraft]);

  useEffect(() => () => {
    uploadAbort.current?.abort();
    setPending((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const attachFile = useCallback(async (file) => {
    if (!file) return;
    if (useChatStore.getState().editingMessage) {
      toast.error("Finish editing before adding an attachment.");
      return;
    }
    const kind = kindForFile(file);
    let prepared = file;
    if (kind === "image") {
      try {
        prepared = await compressPhoto(file);
      } catch (error) {
        toast.error(error.message);
        return;
      }
    }
    const problem = validateFileForUpload(prepared, kind);
    if (problem) {
      toast.error(problem);
      return;
    }
    const meta = await probeMedia(prepared, kind);
    setPending((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { file: prepared, kind, url: URL.createObjectURL(prepared), meta };
    });
    setMenuOpen(false);
    textareaRef.current?.focus();
  }, []);

  // Files dropped on the chat or pasted elsewhere arrive through the store.
  useEffect(() => {
    if (!queuedFile) return;
    attachFile(queuedFile);
    clearQueuedFile();
  }, [queuedFile, attachFile, clearQueuedFile]);

  const onPickFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    attachFile(file);
  };

  const onPaste = (event) => {
    const file = [...(event.clipboardData?.files || [])][0];
    if (file) {
      event.preventDefault();
      attachFile(file);
    }
  };

  const insertEmoji = (emoji) => {
    const field = textareaRef.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setText(useChatStore.getState().drafts[String(selectedUser?._id)] || "");
  };

  const expiresAt = () => (disappearing ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null);

  const uploadPending = async (item) => {
    const controller = new AbortController();
    uploadAbort.current = controller;
    setProgress(0);
    try {
      return await uploadMedia(item.file, { kind: item.kind, meta: item.meta, signal: controller.signal, onProgress: setProgress });
    } finally {
      uploadAbort.current = null;
      setProgress(null);
    }
  };

  const describeUploadError = (error) => {
    if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") return null;
    return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || "Upload failed.";
  };

  const handleSendMessage = async (event) => {
    event?.preventDefault();
    if (!canComposeInConversation(conversationStatus, conversationInitiatedBy, authUser?._id)) return;
    if (editingMessage) {
      if (!text.trim() || sending) return;
      await editMessage(editingMessage._id, text.trim());
      setText(useChatStore.getState().drafts[String(selectedUser?._id)] || "");
      return;
    }
    if (busy || (!text.trim() && !pending)) return;
    let attachment = null;
    if (pending) {
      try {
        attachment = await uploadPending(pending);
      } catch (error) {
        const message = describeUploadError(error);
        if (message) toast.error(message);
        return;
      }
    }
    const sent = await sendMessage({ text: text.trim(), attachment, expiresAt: expiresAt() });
    if (sent === false) return;
    stopTyping();
    setText("");
    setDraft(selectedUser?._id, "");
    clearPending();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const sendVoiceNote = async (file, seconds) => {
    setRecording(false);
    stopTyping();
    try {
      const attachment = await uploadPending({ file, kind: "audio", meta: { duration: seconds } });
      await sendMessage({ text: "", attachment, expiresAt: expiresAt() });
    } catch (error) {
      const message = describeUploadError(error);
      if (message) toast.error(message);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const showMic = !editingMessage && !pending && !text.trim();

  return (
    <form onSubmit={handleSendMessage} className="relative shrink-0 border-t border-base-300 bg-base-100 px-2 py-2 sm:px-3 safe-bottom">
      {editingMessage && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-base-200 px-3 py-1.5 text-xs">
          <span className="font-medium">Editing message</span>
          <button type="button" onClick={cancelEdit} aria-label="Cancel edit"><X size={16} /></button>
        </div>
      )}
      {replyingTo && !editingMessage && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-md border-l-2 border-primary bg-base-200 px-3 py-1.5 text-xs">
          <div className="min-w-0">
            <p className="font-medium">Replying to {String(replyingTo.senderId) === String(authUser?._id) ? "yourself" : selectedUser?.fullName}</p>
            <p className="truncate opacity-70">
              {replyingTo.decryptStatus === "pending" || isEncryptedText(replyingTo.displayText)
                ? "Please wait while we are fetching your chat…"
                : replyingTo.decryptStatus === "failed"
                  ? "Unable to decrypt this message"
                  : (replyingTo.displayText || mediaLabel(replyingTo.attachment) || (replyingTo.image ? "📷 Photo" : ""))}
            </p>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={16} /></button>
        </div>
      )}
      {pending && !editingMessage && (
        <AttachmentPreview
          pending={pending}
          progress={progress}
          onRemove={clearPending}
          onCancelUpload={() => uploadAbort.current?.abort()}
        />
      )}
      {!pending && progress != null && (
        <div className="mb-2 flex items-center gap-2 px-1 text-xs">
          <span>Sending voice message…</span>
          <progress className="progress progress-primary h-1.5 flex-1" value={progress} max="100" />
        </div>
      )}

      <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPickFile} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />

      <div className="flex items-end gap-1">
        {recording ? (
          <VoiceRecorder
            onCancel={() => { setRecording(false); stopTyping(); }}
            onSend={sendVoiceNote}
            onActivity={() => pingActivity("recording")}
          />
        ) : (
          <>
            {!editingMessage && (
              <div className="relative flex items-end">
                <button
                  type="button"
                  className="ui-press mb-0.5 rounded-full p-2 hover:bg-base-200"
                  aria-label="Emoji"
                  aria-expanded={emojiOpen}
                  onClick={() => { setEmojiOpen((open) => !open); setMenuOpen(false); }}
                >
                  <Smile size={21} />
                </button>
                {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
                <button
                  type="button"
                  className="ui-press mb-0.5 rounded-full p-2 hover:bg-base-200 disabled:opacity-40"
                  aria-label="Attach"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  disabled={busy}
                  onClick={() => { setMenuOpen((open) => !open); setEmojiOpen(false); }}
                >
                  <Paperclip size={20} />
                </button>
                {menuOpen && (
                  <>
                    <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close attach menu" onClick={() => setMenuOpen(false)} />
                    <div className="ui-pop absolute bottom-full left-0 z-40 mb-2 w-52 rounded-xl border border-base-300 bg-base-100 py-1 text-sm shadow-lg" role="menu">
                      <button type="button" role="menuitem" className="flex w-full items-center gap-3 px-3 py-2 hover:bg-base-200" onClick={() => { setMenuOpen(false); mediaInputRef.current?.click(); }}>
                        <span className="rounded-full bg-primary/15 p-1.5 text-primary"><ImageIcon size={16} /></span> Photos & videos
                      </button>
                      <button type="button" role="menuitem" className="flex w-full items-center gap-3 px-3 py-2 hover:bg-base-200" onClick={() => { setMenuOpen(false); setCameraOpen(true); }}>
                        <span className="rounded-full bg-secondary/15 p-1.5 text-secondary"><Camera size={16} /></span> Camera
                      </button>
                      <button type="button" role="menuitem" className="flex w-full items-center gap-3 px-3 py-2 hover:bg-base-200" onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }}>
                        <span className="rounded-full bg-accent/15 p-1.5 text-accent"><FileText size={16} /></span> Document
                      </button>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={disappearing}
                        className="flex w-full items-center gap-3 px-3 py-2 hover:bg-base-200"
                        onClick={() => setDisappearing((value) => !value)}
                      >
                        <span className={`rounded-full p-1.5 ${disappearing ? "bg-primary text-primary-content" : "bg-base-200"}`}><Timer size={16} /></span>
                        Disappear in 24h {disappearing ? "✓" : ""}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => handleTyping(e.target.value)}
                onBlur={stopTyping}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={pending ? "Add a caption…" : "Type a message"}
                disabled={progress != null}
                className="max-h-32 min-h-[40px] w-full resize-none rounded-2xl border border-base-300 bg-base-200 px-3 py-2 text-base leading-5 outline-none focus:border-primary disabled:opacity-60 sm:text-sm"
              />
              {disappearing && !editingMessage && (
                <Timer size={12} className="pointer-events-none absolute right-2 top-1.5 text-primary" aria-label="Disappearing message on" />
              )}
            </div>
            {!editingMessage && !pending && !text.trim() && (
              <button
                type="button"
                className="ui-press mb-0.5 rounded-full p-2 hover:bg-base-200"
                aria-label="Open camera"
                onClick={() => setCameraOpen(true)}
              >
                <Camera size={21} />
              </button>
            )}
            {showMic ? (
              <button
                type="button"
                className="mb-0.5 rounded-full bg-primary p-2 text-primary-content ui-press disabled:opacity-40"
                aria-label="Record voice message"
                disabled={busy}
                onClick={() => { setRecording(true); setMenuOpen(false); setEmojiOpen(false); }}
              >
                <Mic size={20} />
              </button>
            ) : (
              <button
                type="submit"
                className="mb-0.5 rounded-full bg-primary p-2 text-primary-content ui-press disabled:opacity-40"
                aria-label={editingMessage ? "Save edit" : "Send"}
                disabled={busy || (!text.trim() && !pending)}
              >
                <Send size={20} />
              </button>
            )}
          </>
        )}
      </div>
      {cameraOpen && <CameraCapture onClose={() => setCameraOpen(false)} onCapture={attachFile} />}
    </form>
  );
};

export default MessageInput;
