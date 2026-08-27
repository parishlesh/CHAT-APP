/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, Copy, MoreVertical, Pencil, Reply, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";
import { useChatStore } from "../store/useChatStore";
import { formatMessageTime } from "../lib/time";

const MessageBubble = ({ message }) => {
  const { authUser } = useAuth();
  const { selectedUser, messageMatchIds, setEditingMessage, setReplyingTo, deleteMessage } = useChatStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef(null);
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

  useEffect(() => () => clearPress(), []);

  return (
    <div id={`msg-${message._id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
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
            className={`absolute top-0.5 z-10 rounded-full p-1 text-current/70 hover:bg-black/10 ${mine ? "left-0" : "right-0"} opacity-80 md:opacity-0 md:group-hover:opacity-100`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={16} />
          </button>
        )}

        <div
          className={`px-2.5 py-1.5 shadow-none ${message.deleted ? "" : mine ? "pl-7" : "pr-7"} ${messageMatchIds.includes(message._id) ? "ring-2 ring-warning" : ""} ${
            mine
              ? "bg-primary text-primary-content rounded-lg rounded-br-none"
              : "bg-base-200 text-base-content rounded-lg rounded-bl-none"
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

        {menuOpen && !message.deleted && (
          <>
            <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close message actions" onClick={() => { setMenuOpen(false); setConfirmDelete(false); }} />
            <div className={`absolute z-30 mt-1 w-36 rounded-lg border border-base-300 bg-base-100 py-1 text-sm text-base-content shadow-md ${mine ? "right-0" : "left-0"}`}>
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
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-base-200" onClick={() => { setReplyingTo(message); setMenuOpen(false); }}>
                    <Reply size={14} /> Reply
                  </button>
                  {message.displayText && (
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-base-200" onClick={copyText}>
                      <Copy size={14} /> Copy
                    </button>
                  )}
                  {mine && message.displayText && (
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-base-200" aria-label="Edit" onClick={() => { setEditingMessage(message); setMenuOpen(false); }}>
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                  {mine && (
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-error hover:bg-base-200" aria-label="Delete" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
