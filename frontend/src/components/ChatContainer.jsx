import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { useAuth } from "../store/useAuth";
import { themeForMood } from "../lib/moods";
import { peerKeyFingerprint } from "../lib/encryption";
import { formatConversationDayKey } from "../lib/time";
import ChatHeader from "./ChatHeader";
import MoodBanner from "./MoodBanner";
import MoodPicker from "./MoodPicker";
import VibePrompt from "./VibePrompt";
import VibePicker from "./VibePicker";
import RequestComposer from "./RequestComposer";
import MessageInput from "./MessageInput";
import MessageBubble from "./MessageBubble";
import DateSeparator from "./DateSeparator";
import MessageSkeleton from "./skeleton/MessageSkeleton";
import ScrollContainer from "./scrollbarContainer";
import { wallpaperClass, RITUALS, findMeta } from "../config/conversationExtras";
import { ChevronDown, Search, X } from "lucide-react";

const ChatContainer = () => {
  const {
    messages, getMessages, loadOlderMessages, isMessageLoading, isLoadingOlder, selectedUser, pruneExpired,
    messageSearch, messageMatchIds, searchMessages, messageSearchOpen, setMessageSearchOpen, goToMatch, matchIndex,
    getConversationDetails, appearance, conversationLocked, rituals, upsertRitual, patchConversationMeta,
    retryPendingDecryption, conversationStatus, conversationInitiatedBy,
  } = useChatStore();
  const { getConversationMood, clearConversationMood } = useConversationThemeStore();
  const { authUser, encryptionInitialized } = useAuth();
  const conversationTheme = themeForMood(authUser?.mood);
  const peerFingerprint = peerKeyFingerprint(selectedUser?.encryptionPublicKey);
  const incomingPending = conversationStatus === "pending" && conversationInitiatedBy && String(conversationInitiatedBy) !== String(authUser?._id);
  const incomingDeclined = conversationStatus === "declined" && conversationInitiatedBy && String(conversationInitiatedBy) !== String(authUser?._id);
  const endRef = useRef(null);
  const scrollerRef = useRef(null);
  const stickToBottom = useRef(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!selectedUser?._id) return;
    const userId = selectedUser._id;
    let cancelled = false;
    stickToBottom.current = true;
    getConversationMood(userId);
    (async () => {
      await getConversationDetails();
      if (!cancelled) getMessages(userId);
    })();
    return () => {
      cancelled = true;
      clearConversationMood();
    };
  }, [selectedUser?._id, encryptionInitialized, getMessages, getConversationMood, clearConversationMood, getConversationDetails]);

  useEffect(() => {
    if (encryptionInitialized) retryPendingDecryption();
  }, [encryptionInitialized, retryPendingDecryption]);

  useEffect(() => {
    if (peerFingerprint) retryPendingDecryption({ includeFailed: true });
  }, [peerFingerprint, retryPendingDecryption]);

  useEffect(() => {
    const timer = setInterval(pruneExpired, 30000);
    return () => clearInterval(timer);
  }, [pruneExpired]);

  const lastMessageId = messages[messages.length - 1]?._id;

  useEffect(() => {
    if (isMessageLoading) return;
    if (stickToBottom.current) {
      endRef.current?.scrollIntoView({ behavior: "auto" });
      setShowNew(false);
    } else {
      setShowNew(true);
    }
  }, [lastMessageId, isMessageLoading]);

  useEffect(() => {
    if (messageSearchOpen) document.getElementById("conversation-message-search")?.focus();
  }, [messageSearchOpen]);

  const onScroll = async (event) => {
    const el = event.currentTarget;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    if (stickToBottom.current) setShowNew(false);
    if (el.scrollTop < 64) {
      const previousHeight = el.scrollHeight;
      const loaded = await loadOlderMessages();
      if (loaded) el.scrollTop = el.scrollHeight - previousHeight;
    }
  };

  const dueRitual = rituals.find((ritual) => ritual.due);
  const dueMeta = findMeta(RITUALS, dueRitual?.key);

  return (
    <div className="ui-chat-enter relative flex h-full min-h-0 w-full flex-col bg-base-100" data-theme={conversationTheme}>
      <ChatHeader />
      <VibePicker />
      <VibePrompt />
      <MoodBanner />
      {dueMeta && (
        <div className="flex items-center justify-between gap-2 border-b border-base-300 px-3 py-1.5 text-xs">
          <span>{dueMeta.emoji} {dueMeta.prompt}</span>
          <button type="button" className="opacity-70" onClick={() => upsertRitual({ key: dueRitual.key, recurrence: dueRitual.recurrence, prompted: true })}>Dismiss</button>
        </div>
      )}
      {messageSearchOpen && (
        <label className="flex items-center gap-2 border-b border-base-300 bg-base-100 px-3 py-2">
          <Search size={16} className="opacity-60" />
          <input
            id="conversation-message-search"
            value={messageSearch}
            onChange={(event) => searchMessages(event.target.value)}
            placeholder="Search messages..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            aria-label="Search messages in this conversation"
          />
          {messageSearch && (
            <button type="button" className="text-xs opacity-70" onClick={() => goToMatch(1)}>
              {messageMatchIds.length ? `${matchIndex + 1}/${messageMatchIds.length}` : "0"}
            </button>
          )}
          <button type="button" className="p-1" aria-label="Close search" onClick={() => setMessageSearchOpen(false)}>
            <X size={16} />
          </button>
        </label>
      )}
      {isMessageLoading ? (
        <MessageSkeleton />
      ) : (
        <div className="relative min-h-0 flex-1">
          <ScrollContainer ref={scrollerRef} className="h-full" onScroll={onScroll}>
            <div className={`flex min-h-full flex-col justify-end space-y-1.5 px-3 py-3 sm:px-6 ${wallpaperClass(appearance?.wallpaper)}`}>
              {isLoadingOlder && <p className="py-2 text-center text-xs text-base-content/50">Loading earlier messages…</p>}
              {messages?.length > 0 ? (
                messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const showDate = formatConversationDayKey(message.createdAt) !== formatConversationDayKey(previous?.createdAt);
                  return (
                    <div key={message._id}>
                      {showDate && <DateSeparator createdAt={message.createdAt} />}
                      <MessageBubble message={message} />
                    </div>
                  );
                })
              ) : (
                <p className="pb-16 text-center text-sm text-base-content/50">
                  Start a conversation with {selectedUser?.fullName}
                </p>
              )}
              <div ref={endRef} />
            </div>
          </ScrollContainer>
          {showNew && (
            <button
              type="button"
              className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs text-primary-content shadow"
              onClick={() => {
                stickToBottom.current = true;
                endRef.current?.scrollIntoView({ behavior: "smooth" });
                setShowNew(false);
              }}
            >
              <span className="inline-flex items-center gap-1"><ChevronDown size={14} /> New messages</span>
            </button>
          )}
        </div>
      )}
      {incomingPending ? (
        <RequestComposer />
      ) : incomingDeclined ? (
        <div className="shrink-0 border-t border-base-300 px-4 py-3 text-center text-xs text-base-content/60">
          You declined this conversation request.
        </div>
      ) : (
        <MessageInput />
      )}
      <MoodPicker />
      {conversationLocked && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-base-100/95 p-6 text-center">
          <p className="text-sm font-medium">This conversation is locked on this device.</p>
          <p className="mt-1 max-w-xs text-xs opacity-60">This is a reminder only. It is not biometric or device authentication.</p>
          <button type="button" className="btn btn-primary btn-sm mt-4 ui-press" onClick={() => patchConversationMeta({ locked: false })}>Unlock</button>
        </div>
      )}
    </div>
  );
};

export default ChatContainer;
