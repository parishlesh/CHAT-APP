/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, Copy, MoreVertical, Pencil, Reply, Star, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";
import { useChatStore } from "../store/useChatStore";
import { formatMessageTime } from "../lib/time";
import { MEMORY_TYPES, REACTIONS, bubbleClass } from "../config/conversationExtras";

const MessageBubble = ({ message }) => {
  const { authUser } = useAuth();
  const { selectedUser, messageMatchIds, setEditingMessage, setReplyingTo, deleteMessage, appearance, reactToMessage, clearReaction, createMemory } = useChatStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryNote, setMemoryNote] = useState("");
  const [memoryType, setMemoryType] = useState("memory");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [popReaction, setPopReaction] = useState(null);
  const pressTimer = useRef(null);
  const lastMineReaction = useRef(undefined);
  const mine = String(message.senderId) === String(authUser._id);

  const clearPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const openMenu = () => {
    if (message.deleted) return;
    setMenuOpen(true);
  };

  const copyText = async () => {
    if (!message.displayText) return;
    try {
      await navigator.clipboard.writeText(message.displayText);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy.");
    }
    setMenuOpen(false);
  };

  useEffect(() => {
    const mineReaction = (message.reactions || []).find((reaction) => String(reaction.userId) === String(authUser._id));
    const key = mineReaction?.key || null;
    if (lastMineReaction.current === undefined) {
      lastMineReaction.current = key;
      return;
    }
    if (key && key !== lastMineReaction.current) setPopReaction(key);
    lastMineReaction.current = key;
  }, [message.reactions, authUser._id]);

  useEffect(() => {
    if (!memoryOpen) return;
    const onKey = (event) => { if (event.key === "Escape") setMemoryOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [memoryOpen]);

  return (
    <div id={`msg-${message._id}`} className={`ui-msg-enter flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className="group relative max-w-[80%] sm:max-w-[70%]"
        onContextMenu={(event) => { event.preventDefault(); openMenu(); }}
        onTouchStart={() => { pressTimer.current = setTimeout(openMenu, 500); }}
        onTouchEnd={clearPress}
        onTouchMove={clearPress}
      >
        {!message.deleted && (
          <button
            type="button"
            aria-label="Message actions"
            className={`ui-press absolute top-0.5 z-10 rounded-full p-1 text-current/70 hover:bg-black/10 ${mine ? "left-0" : "right-0"} opacity-80 md:opacity-0 md:group-hover:opacity-100`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={16} />
          </button>
        )}

        <div
          className={`px-2.5 py-1.5 shadow-none ${message.deleted ? "" : mine ? "pl-7" : "pr-7"} ${messageMatchIds.includes(message._id) ? "ring-2 ring-warning" : ""} ${
            mine
              ? `bg-primary text-primary-content ${bubbleClass(appearance?.bubbleStyle, true)}`
              : `bg-base-200 text-base-content ${bubbleClass(appearance?.bubbleStyle, false)}`
          }`}
        >
          {message.deleted ? (
            <p className="italic text-sm opacity-70">This message was deleted</p>
          ) : (
            <>
              {message.replyPreview && (
                <div className={`mb-1 rounded border-l-2 px-2 py-1 text-xs ${mine ? "border-primary-content/70 bg-black/10" : "border-primary bg-base-300/70"}`}>
                  <p className="font-medium truncate">
                    {String(message.replyPreview.senderId) === String(authUser._id) ? "You" : selectedUser?.fullName}
                  </p>
                  <p className="truncate opacity-80">
                    {message.replyPreview.deleted ? "This message was deleted" : message.replyPreview.displayText || (message.replyPreview.image ? "Photo" : "")}
                  </p>
                </div>
              )}
              {message.image && (
                <img src={message.image} alt="Sent" className="mb-1 max-h-64 w-full max-w-[240px] rounded-md object-cover" />
              )}
              {message.displayText && (
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[15px] leading-snug">{message.displayText}</p>
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

        {!message.deleted && Boolean(message.reactions?.length) && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => {
              const meta = REACTIONS.find((item) => item.key === reaction.key);
              return (
                <span
                  key={`${reaction.userId}-${reaction.key}`}
                  className={`rounded-full bg-base-200 px-1.5 text-[11px] ${popReaction === reaction.key && String(reaction.userId) === String(authUser._id) ? "ui-react-pop" : ""}`}
                >
                  {meta?.emoji || "•"}
                </span>
              );
            })}
          </div>
        )}

        {menuOpen && !message.deleted && (
          <>
            <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close message actions" onClick={() => { setMenuOpen(false); setConfirmDelete(false); }} />
            <div className={`ui-pop absolute z-30 mt-1 w-44 rounded-lg border border-base-300 bg-base-100 py-1 text-sm text-base-content shadow-md ${mine ? "right-0" : "left-0"}`}>
              {confirmDelete ? (
                <div className="px-3 py-2">
                  <p className="mb-2 text-xs">Delete message?</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="text-xs opacity-70" onClick={() => setConfirmDelete(false)}>Cancel</button>
                    <button
                      type="button"
                      className="text-xs font-medium text-error"
                      onClick={() => { deleteMessage(message._id); setMenuOpen(false); setConfirmDelete(false); }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 hover:bg-base-200" onClick={() => { setReplyingTo(message); setMenuOpen(false); }}>
                    <Reply size={14} /> Reply
                  </button>
                  <div className="flex flex-wrap gap-0.5 px-2 py-1">
                    {REACTIONS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        title={item.label}
                        className="ui-press rounded p-0.5 hover:bg-base-200"
                        onClick={() => {
                          const mineReaction = (message.reactions || []).find((reaction) => String(reaction.userId) === String(authUser._id));
                          if (mineReaction?.key === item.key) clearReaction(message._id);
                          else reactToMessage(message._id, item.key);
                          setMenuOpen(false);
                        }}
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 hover:bg-base-200" onClick={() => {
                    setMemoryTitle((message.displayText || "Memory").slice(0, 80));
                    setMemoryNote("");
                    setMemoryType("memory");
                    setMemoryOpen(true);
                    setMenuOpen(false);
                  }}>
                    <Star size={14} /> Save as Memory
                  </button>
                  {message.displayText && (
                    <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 hover:bg-base-200" onClick={copyText}>
                      <Copy size={14} /> Copy
                    </button>
                  )}
                  {mine && message.displayText && (
                    <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 hover:bg-base-200" aria-label="Edit" onClick={() => { setEditingMessage(message); setMenuOpen(false); }}>
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                  {mine && (
                    <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 text-error hover:bg-base-200" aria-label="Delete" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
        {memoryOpen && (
          <>
            <button type="button" className="fixed inset-0 z-40 cursor-default bg-black/30" aria-label="Close memory" onClick={() => setMemoryOpen(false)} />
            <form
              className="ui-pop absolute z-50 mt-2 w-64 rounded-lg border border-base-300 bg-base-100 p-3 text-base-content shadow-md"
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
