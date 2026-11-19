/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import {
  Check, CheckCheck, Clock3, Copy, Download, FileText, Forward, Maximize2, MoreVertical, Pencil, Pin, PinOff, Play, Reply, Star, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";
import { useChatStore } from "../store/useChatStore";
import { formatMessageTime } from "../lib/time";
import { MEMORY_TYPES, REACTIONS, bubbleClass } from "../config/conversationExtras";
import { isEncryptedText } from "../lib/encryption";
import { canComposeInConversation } from "../lib/conversationAccess";
import { downloadUrl, formatBytes, formatDuration, mediaLabel, mediaOf } from "../lib/media";

const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING_PUNCTUATION = /[).,!?;:'"\]]+$/;

// Turn bare URLs into links. Plain text stays text, so nothing from a message is ever rendered as HTML.
const Linkified = ({ text }) => {
  const parts = String(text).split(URL_PATTERN);
  return parts.map((part, index) => {
    if (index % 2 === 0) return part;
    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] || "";
    const link = trailing ? part.slice(0, -trailing.length) : part;
    const href = link.startsWith("www.") ? `https://${link}` : link;
    return (
      <span key={index}>
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 [overflow-wrap:anywhere]" onClick={(event) => event.stopPropagation()}>
          {link}
        </a>
        {trailing}
      </span>
    );
  });
};

const MediaContent = ({ media, mine, onOpen }) => {
  if (media.kind === "image") {
    return (
      <button type="button" className="mb-1 block overflow-hidden rounded-md" onClick={onOpen} aria-label="Open photo">
        <img
          src={media.url}
          alt={media.name || "Photo"}
          loading="lazy"
          width={media.width || undefined}
          height={media.height || undefined}
          className="max-h-72 w-full max-w-[280px] object-cover"
        />
      </button>
    );
  }
  if (media.kind === "video") {
    return (
      <div className="relative mb-1 overflow-hidden rounded-md bg-black">
        <video src={media.url} controls preload="metadata" playsInline className="max-h-72 w-full max-w-[280px]" />
        <button type="button" className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white" onClick={onOpen} aria-label="Open video full screen">
          <Maximize2 size={14} />
        </button>
      </div>
    );
  }
  if (media.kind === "audio") {
    return (
      <div className="mb-1 flex min-w-[220px] items-center gap-2">
        <Play size={16} className="shrink-0 opacity-70" aria-hidden="true" />
        <audio src={media.url} controls preload="metadata" className="h-9 w-full min-w-0 max-w-[260px]" />
        {media.duration != null && <span className="shrink-0 text-[11px] tabular-nums opacity-70">{formatDuration(media.duration)}</span>}
      </div>
    );
  }
  return (
    <a
      href={downloadUrl(media)}
      target="_blank"
      rel="noopener noreferrer"
      download={media.name || true}
      className={`mb-1 flex min-w-[200px] max-w-[280px] items-center gap-3 rounded-md p-2 ${mine ? "bg-black/10" : "bg-base-300/60"}`}
    >
      <FileText className="shrink-0" size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{media.name || "File"}</span>
        <span className="block text-[11px] opacity-70">{[formatBytes(media.bytes), (media.name?.split(".").pop() || "").toUpperCase()].filter(Boolean).join(" · ")}</span>
      </span>
      <Download size={16} className="shrink-0 opacity-70" />
    </a>
  );
};

const MenuItem = ({ icon: Icon, label, onClick, danger }) => (
  <button type="button" className={`ui-press flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-base-200 sm:gap-2 sm:px-3 sm:py-2 ${danger ? "text-error" : ""}`} onClick={onClick}>
    <Icon size={16} className="shrink-0 opacity-80" /> {label}
  </button>
);

const isPhoneWidth = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches;

const MessageBubble = ({ message }) => {
  const { authUser } = useAuth();
  const {
    selectedUser, messageMatchIds, setEditingMessage, setReplyingTo, deleteMessage, appearance, reactToMessage, clearReaction,
    createMemory, conversationStatus, conversationInitiatedBy, pinnedMessages, pinMessage, unpinMessage, openViewer, setForwarding,
  } = useChatStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState("popover"); // "sheet" on phones
  const [menuUp, setMenuUp] = useState(false);
  const wrapRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryNote, setMemoryNote] = useState("");
  const [memoryType, setMemoryType] = useState("memory");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [popReaction, setPopReaction] = useState(null);
  const pressTimer = useRef(null);
  const lastTap = useRef(0);
  const lastMineReaction = useRef(undefined);
  const mine = String(message.senderId) === String(authUser._id);
  const canCompose = canComposeInConversation(conversationStatus, conversationInitiatedBy, authUser._id);
  const decrypting = message.decryptStatus === "pending" || isEncryptedText(message.displayText);
  const decryptFailed = message.decryptStatus === "failed";
  const isSystem = message.kind === "system" || Boolean(message.systemEvent);
  const media = mediaOf(message);
  const isPinned = pinnedMessages.some((pin) => String(pin.messageId) === String(message._id));
  const sentMessage = !message.pending && !String(message._id).startsWith("temp-");
  const myReaction = (message.reactions || []).find((reaction) => String(reaction.userId) === String(authUser._id));

  const clearPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const canAct = !message.deleted && !isSystem && canCompose && sentMessage;
  const openMenu = () => {
    if (!canAct) return;
    if (isPhoneWidth()) {
      setMenuMode("sheet");
    } else {
      // Open upward when the bubble is near the bottom so the menu never hides behind the composer.
      const rect = wrapRef.current?.getBoundingClientRect();
      setMenuMode("popover");
      setMenuUp(Boolean(rect && rect.bottom > window.innerHeight - 380));
    }
    setMenuOpen(true);
  };
  const onLongPress = () => {
    if (!canAct) return;
    navigator.vibrate?.(10);
    openMenu();
  };
  const close = () => { setMenuOpen(false); setConfirmDelete(false); };

  const toggleReaction = (key) => {
    if (!sentMessage || !canCompose || message.deleted) return;
    if (myReaction?.key === key) clearReaction(message._id);
    else reactToMessage(message._id, key);
  };

  // Double-click (desktop) or double-tap (touch) to ❤️, like most chat apps.
  const onDoubleTap = (event) => {
    if (event.target.closest("a, button, video, audio")) return;
    toggleReaction("feel");
  };
  const onTouchEnd = (event) => {
    clearPress();
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      onDoubleTap(event);
    } else {
      lastTap.current = now;
    }
  };

  const copyText = async () => {
    if (message.decryptStatus === "pending" || message.decryptStatus === "failed" || !message.displayText || isEncryptedText(message.displayText)) return;
    try {
      await navigator.clipboard.writeText(message.displayText);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy.");
    }
    close();
  };

  useEffect(() => {
    const key = myReaction?.key || null;
    if (lastMineReaction.current === undefined) {
      lastMineReaction.current = key;
      return;
    }
    if (key && key !== lastMineReaction.current) setPopReaction(key);
    lastMineReaction.current = key;
  }, [myReaction?.key]);

  useEffect(() => {
    if (!memoryOpen) return;
    const onKey = (event) => { if (event.key === "Escape") setMemoryOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [memoryOpen]);

  if (isSystem) {
    return (
      <div id={`msg-${message._id}`} className="ui-msg-enter flex justify-center py-2">
        <p className="max-w-[90%] rounded-full border border-base-300 bg-base-200 px-3 py-1 text-center text-[11px] text-base-content/70">
          {message.systemEvent === "request_declined" && mine
            ? `You rejected ${selectedUser?.fullName || "this"}'s conversation request.`
            : message.displayText || "This user has rejected your conversation request."}
        </p>
      </div>
    );
  }

  const groupedReactions = Object.values((message.reactions || []).reduce((groups, reaction) => {
    const key = reaction.key;
    groups[key] = groups[key] || { key, count: 0, mine: false };
    groups[key].count += 1;
    if (String(reaction.userId) === String(authUser._id)) groups[key].mine = true;
    return groups;
  }, {}));

  const replyText = (preview) => {
    if (preview.deleted) return "This message was deleted";
    if (preview.decryptStatus === "pending" || isEncryptedText(preview.displayText)) return "Please wait while we are fetching your chat…";
    if (preview.decryptStatus === "failed") return "Unable to decrypt this message";
    return preview.displayText || mediaLabel(mediaOf(preview)) || "";
  };

  return (
    <div id={`msg-${message._id}`} className={`ui-msg-enter flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="group relative max-w-[85%] sm:max-w-[70%]"
        onContextMenu={(event) => { event.preventDefault(); openMenu(); }}
        ref={wrapRef}
        onTouchStart={() => { pressTimer.current = setTimeout(onLongPress, 450); }}
        onTouchEnd={onTouchEnd}
        onTouchMove={clearPress}
        onDoubleClick={onDoubleTap}
      >
        {canAct && (
          // Mouse/trackpad users get quick actions beside the bubble on hover; touch users long-press.
          <div
            className={`absolute top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex ${mine ? "right-full mr-1 flex-row-reverse" : "left-full ml-1"}`}
          >
            <button type="button" aria-label="Reply" title="Reply" className="ui-press rounded-full p-1.5 text-base-content/60 hover:bg-base-200 hover:text-base-content" onClick={() => setReplyingTo(message)}>
              <Reply size={16} />
            </button>
            <button type="button" aria-label="Message actions" title="More" className="ui-press rounded-full p-1.5 text-base-content/60 hover:bg-base-200 hover:text-base-content" onClick={openMenu}>
              <MoreVertical size={16} />
            </button>
          </div>
        )}

        <div
          className={`vl-bubble px-3 py-1.5 shadow-sm ${messageMatchIds.includes(message._id) ? "ring-2 ring-warning" : ""} ${
            mine
              ? `bg-primary text-primary-content ${bubbleClass(appearance?.bubbleStyle, true)}`
              : `bg-base-200 text-base-content ${bubbleClass(appearance?.bubbleStyle, false)}`
          }`}
        >
          {message.deleted ? (
            <p className="italic text-sm opacity-70">This message was deleted</p>
          ) : (
            <>
              {(message.forwarded || isPinned) && (
                <p className="mb-0.5 flex items-center gap-2 text-[11px] italic opacity-70">
                  {message.forwarded && <span className="inline-flex items-center gap-1"><Forward size={11} /> Forwarded</span>}
                  {isPinned && <span className="inline-flex items-center gap-1 not-italic"><Pin size={11} /> Pinned</span>}
                </p>
              )}
              {message.replyPreview && (
                <button
                  type="button"
                  className={`mb-1 block w-full rounded border-l-2 px-2 py-1 text-left text-xs ${mine ? "border-primary-content/70 bg-black/10" : "border-primary bg-base-300/70"}`}
                  onClick={() => document.getElementById(`msg-${message.replyPreview._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                >
                  <p className="font-medium truncate">
                    {String(message.replyPreview.senderId) === String(authUser._id) ? "You" : selectedUser?.fullName}
                  </p>
                  <p className="truncate opacity-80">{replyText(message.replyPreview)}</p>
                </button>
              )}
              {media && <MediaContent media={media} mine={mine} onOpen={() => openViewer({ ...media, senderName: mine ? "You" : selectedUser?.fullName, createdAt: message.createdAt })} />}
              {decrypting && (
                <p className="vl-msg-text leading-snug opacity-70">Please wait while we are fetching your chat…</p>
              )}
              {decryptFailed && (
                <p className="vl-msg-text leading-snug opacity-70">Unable to decrypt this message</p>
              )}
              {!decrypting && !decryptFailed && message.displayText && (
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] vl-msg-text leading-snug"><Linkified text={message.displayText} /></p>
              )}
              {message.edited && <span className="text-[11px] opacity-60">(edited)</span>}
            </>
          )}
          <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] opacity-70">
            <span>{formatMessageTime(message.createdAt)}</span>
            {message.expiresAt && !message.deleted && <Clock3 size={12} aria-label="Disappearing message" />}
            {mine && !message.deleted && (
              message.pending
                ? <Clock3 size={12} aria-label="Sending" />
                : message.seen
                ? <CheckCheck size={14} className="text-info" aria-label="Seen" />
                : <Check size={14} aria-label="Sent" />
            )}
          </div>
        </div>

        {!message.deleted && groupedReactions.length > 0 && (
          <div className={`-mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
            {groupedReactions.map((group) => {
              const meta = REACTIONS.find((item) => item.key === group.key);
              return (
                <button
                  type="button"
                  key={group.key}
                  title={meta?.label}
                  onClick={() => toggleReaction(group.key)}
                  className={`relative z-[1] rounded-full border px-1.5 text-[12px] shadow-sm ${group.mine ? "border-primary bg-base-100" : "border-base-300 bg-base-100"} ${popReaction === group.key && group.mine ? "ui-react-pop" : ""}`}
                >
                  {meta?.emoji || "•"}{group.count > 1 ? <span className="ml-0.5 text-[10px]">{group.count}</span> : null}
                </button>
              );
            })}
          </div>
        )}

        {menuOpen && !message.deleted && (() => {
          const menuBody = (
            <>
                {confirmDelete ? (
                  <div className="px-3 py-2">
                    <p className="mb-2 text-xs">Delete message?</p>
                    <div className="flex flex-col items-stretch gap-1">
                      {mine && (
                        <button type="button" className="rounded px-2 py-1.5 text-left text-xs font-medium text-error hover:bg-base-200" onClick={() => { deleteMessage(message._id, "everyone"); close(); }}>
                          Delete for everyone
                        </button>
                      )}
                      <button type="button" className="rounded px-2 py-1.5 text-left text-xs font-medium text-error hover:bg-base-200" onClick={() => { deleteMessage(message._id, "me"); close(); }}>
                        Delete for me
                      </button>
                      <button type="button" className="rounded px-2 py-1.5 text-left text-xs opacity-70 hover:bg-base-200" onClick={() => setConfirmDelete(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-6 place-items-center gap-1 border-b border-base-300 px-3 pb-2 pt-1 sm:flex sm:flex-wrap sm:gap-0.5 sm:px-2 sm:pb-1">
                      {REACTIONS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          title={item.label}
                          aria-label={`React ${item.label}`}
                          className={`ui-press rounded-lg p-1 text-2xl hover:bg-base-200 sm:p-0.5 sm:text-lg ${myReaction?.key === item.key ? "bg-base-200 ring-1 ring-primary/40" : ""}`}
                          onClick={() => { toggleReaction(item.key); close(); }}
                        >
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                    <MenuItem icon={Reply} label="Reply" onClick={() => { setReplyingTo(message); close(); }} />
                    {!decrypting && !decryptFailed && (
                      <MenuItem icon={Forward} label="Forward" onClick={() => { setForwarding(message); close(); }} />
                    )}
                    <MenuItem
                      icon={isPinned ? PinOff : Pin}
                      label={isPinned ? "Unpin" : "Pin"}
                      onClick={() => { if (isPinned) unpinMessage(message._id); else pinMessage(message._id); close(); }}
                    />
                    {!decrypting && !decryptFailed && message.displayText && (
                      <MenuItem icon={Copy} label="Copy" onClick={copyText} />
                    )}
                    {media && (
                      <a
                        href={downloadUrl(media)}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={media.name || true}
                        className="ui-press flex w-full items-center gap-3 px-4 py-3 hover:bg-base-200 sm:gap-2 sm:px-3 sm:py-2"
                        onClick={close}
                      >
                        <Download size={16} className="shrink-0 opacity-80" /> Download
                      </a>
                    )}
                    {!decrypting && !decryptFailed && (
                      <MenuItem icon={Star} label="Save as Memory" onClick={() => {
                        setMemoryTitle((message.displayText || mediaLabel(media) || "Memory").slice(0, 80));
                        setMemoryNote("");
                        setMemoryType("memory");
                        setMemoryOpen(true);
                        close();
                      }} />
                    )}
                    {mine && !decrypting && !decryptFailed && message.displayText && (
                      <MenuItem icon={Pencil} label="Edit" onClick={() => { setEditingMessage(message); close(); }} />
                    )}
                    <MenuItem icon={Trash2} label="Delete" danger onClick={() => setConfirmDelete(true)} />
                  </>
                )}
            </>
          );
          if (menuMode === "sheet") {
            const previewText = message.displayText || mediaLabel(media) || "";
            return (
              <>
                <button type="button" className="ui-fade fixed inset-0 z-40 cursor-default bg-black/40" aria-label="Close message actions" onClick={close} />
                <div className="ui-sheet fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-base-100 pb-2 text-base text-base-content shadow-xl safe-bottom" role="dialog" aria-label="Message actions">
                  <div className="mx-auto mb-2 mt-2 h-1 w-10 rounded-full bg-base-300" aria-hidden="true" />
                  {previewText && <p className="mx-4 mb-2 line-clamp-2 rounded-lg bg-base-200 px-3 py-2 text-sm text-base-content/80">{previewText}</p>}
                  {menuBody}
                </div>
              </>
            );
          }
          return (
            <>
              <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close message actions" onClick={close} />
              <div className={`ui-pop absolute z-30 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-base-300 bg-base-100 py-1 text-sm text-base-content shadow-lg ${mine ? "right-0" : "left-0"} ${menuUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
                {menuBody}
              </div>
            </>
          );
        })()}
        {memoryOpen && (
          <>
            <button type="button" className="fixed inset-0 z-40 cursor-default bg-black/30" aria-label="Close memory" onClick={() => setMemoryOpen(false)} />
            <form
              className="ui-pop absolute left-0 right-0 z-50 mt-2 w-full max-w-64 rounded-lg border border-base-300 bg-base-100 p-3 text-base-content shadow-md sm:left-auto sm:right-0 sm:w-64"
              onSubmit={async (event) => {
                event.preventDefault();
                if (memoryBusy) return;
                setMemoryBusy(true);
                try {
                  await createMemory({ messageId: message._id, title: memoryTitle, note: memoryNote, type: memoryType });
                  setMemoryOpen(false);
                } finally {
                  setMemoryBusy(false);
                }
              }}
            >
              <p className="text-sm font-medium">Create Memory</p>
              <input value={memoryTitle} onChange={(event) => setMemoryTitle(event.target.value)} className="input input-bordered input-sm mt-2 w-full" placeholder="Title" maxLength={80} />
              <input value={memoryNote} onChange={(event) => setMemoryNote(event.target.value)} className="input input-bordered input-sm mt-2 w-full" placeholder="Optional note" maxLength={280} />
              <select value={memoryType} onChange={(event) => setMemoryType(event.target.value)} className="select select-bordered select-sm mt-2 w-full">
                {MEMORY_TYPES.map((item) => <option key={item.key} value={item.key}>{item.emoji} {item.label}</option>)}
              </select>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="text-xs opacity-70" onClick={() => setMemoryOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-xs ui-press" disabled={memoryBusy || !memoryTitle.trim()}>Save</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
