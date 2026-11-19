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
import VibeEffects from "./VibeEffects";
import PinnedBar from "./PinnedBar";
import MediaViewer from "./MediaViewer";
import ForwardDialog from "./ForwardDialog";
import { wallpaperClass, RITUALS, findMeta } from "../config/conversationExtras";
import { accentCssVars, textSizePx } from "../config/personalization";
import { usePersonalizationStore } from "../store/usePersonalizationStore";
import { useThemeStore } from "../store/useThemeStore";
import { ChevronDown, Paperclip, Search, X } from "lucide-react";

const ChatContainer = () => {
  const {
    messages, getMessages, loadOlderMessages, isMessageLoading, isLoadingOlder, selectedUser, pruneExpired,
    messageSearch, messageMatchIds, searchMessages, messageSearchOpen, setMessageSearchOpen, goToMatch, matchIndex,
    getConversationDetails, appearance, conversationLocked, rituals, upsertRitual, patchConversationMeta,
    retryPendingDecryption, conversationStatus, conversationInitiatedBy, conversationVibe, queueAttachment, setBlocked, sendMessage,
  } = useChatStore();
  const prefs = usePersonalizationStore((state) => state.prefs);
  const appliedAppTheme = useThemeStore((state) => state.appliedAppTheme);
  const { getConversationMood, clearConversationMood } = useConversationThemeStore();
  const { authUser, encryptionInitialized } = useAuth();
  // Mood recolors the chat only if the user wants it; otherwise (or for a neutral mood) follow the app theme.
  const conversationTheme = prefs.moodTheme ? themeForMood(authUser?.mood, appliedAppTheme) : appliedAppTheme;
  const wallpaper = prefs.myWallpaper && prefs.myWallpaper !== "conversation" ? prefs.myWallpaper : appearance?.wallpaper;
  const chatStyle = { ...accentCssVars(prefs.accent), "--vl-msg-size": `${textSizePx(prefs.textSize)}px` };
  const compact = prefs.density === "compact";
  const peerFingerprint = peerKeyFingerprint(selectedUser?.encryptionPublicKey);
  const incomingPending = conversationStatus === "pending" && conversationInitiatedBy && String(conversationInitiatedBy) !== String(authUser?._id);
  const blockedAsDeclinedInitiator = conversationStatus === "declined" && conversationInitiatedBy && String(conversationInitiatedBy) === String(authUser?._id);
  const iRejectedThem = conversationStatus === "declined" && conversationInitiatedBy && String(conversationInitiatedBy) !== String(authUser?._id);
  const endRef = useRef(null);
  const scrollerRef = useRef(null);
  const stickToBottom = useRef(true);
  const [showNew, setShowNew] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const blockedByMe = (authUser?.blockedUsers || []).some((id) => String(id) === String(selectedUser?._id));
  const canAttach = !incomingPending && !blockedAsDeclinedInitiator && !blockedByMe;
  const canStart = canAttach && !conversationLocked;

  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
  const dragHandlers = canAttach ? {
    onDragEnter: (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event) => { if (hasFiles(event)) event.preventDefault(); },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) queueAttachment(file);
    },
  } : {};

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

  const lastMessage = messages[messages.length - 1];
  const lastMessageId = lastMessage?._id;
  const lastIsMine = lastMessage && String(lastMessage.senderId) === String(authUser?._id);

  useEffect(() => {
    if (isMessageLoading) return;
    // Your own new message always brings you to the bottom, even if you'd scrolled up.
    if (lastIsMine) stickToBottom.current = true;
    if (stickToBottom.current) {
      endRef.current?.scrollIntoView({ behavior: "auto" });
      setShowNew(false);
    } else {
      setShowNew(true);
    }
  }, [lastMessageId, isMessageLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (messageSearchOpen) document.getElementById("conversation-message-search")?.focus();
  }, [messageSearchOpen]);

  const onScroll = async (event) => {
    const el = event.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 96;
    setAwayFromBottom(distance > 400);
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
    <div
      className="ui-chat-enter relative flex h-full min-h-0 w-full flex-col bg-base-100"
      data-theme={conversationTheme}
      data-density={prefs.density}
      style={chatStyle}
      {...dragHandlers}
    >
      <ChatHeader />
      <VibePicker />
      <VibePrompt />
      <MoodBanner />
      <PinnedBar />
      {dueMeta && (
        <div className="flex min-h-0 items-center justify-between gap-2 border-b border-base-300 px-3 py-1.5 text-xs">
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
            className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
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
        <div className={`relative min-h-0 flex-1 ${wallpaperClass(wallpaper)}`}>
          <VibeEffects vibe={conversationVibe} particles={prefs.vibeEffects} />
          <ScrollContainer ref={scrollerRef} className="relative z-[1] h-full" onScroll={onScroll}>
            <div className={`mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end px-3 sm:px-6 ${compact ? "py-2" : "py-3"}`}>
              {isLoadingOlder && <p className="py-2 text-center text-xs text-base-content/50">Loading earlier messages…</p>}
              {messages?.length > 0 ? (
                messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const showDate = formatConversationDayKey(message.createdAt) !== formatConversationDayKey(previous?.createdAt);
                  // Back-to-back messages from the same person sit closer together, like most chat apps.
                  const grouped = !showDate && previous && previous.kind !== "system" && message.kind !== "system"
                    && String(previous.senderId) === String(message.senderId)
                    && new Date(message.createdAt) - new Date(previous.createdAt) < 3 * 60 * 1000;
                  const gap = index === 0 || showDate ? "" : grouped ? "mt-0.5" : compact ? "mt-1.5" : "mt-3";
                  return (
                    <div key={message._id} className={gap}>
                      {showDate && <DateSeparator createdAt={message.createdAt} />}
                      <MessageBubble message={message} />
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center gap-3 pb-10 text-center">
                  <img src={selectedUser?.profilePic || "/avatar.svg"} alt="" className="h-16 w-16 rounded-full object-cover" />
                  <div>
                    <p className="font-semibold">{selectedUser?.fullName}</p>
                    <p className="text-sm text-base-content/60">No messages yet. Say hello 👋</p>
                  </div>
                  {canStart && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {["👋 Hey!", "How's it going?", "Long time no see 😄"].map((starter) => (
                        <button key={starter} type="button" className="ui-press rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-sm hover:border-primary" onClick={() => sendMessage({ text: starter })}>
                          {starter}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </ScrollContainer>
          {(showNew || awayFromBottom) && (
            <button
              type="button"
              aria-label={showNew ? "Jump to new messages" : "Scroll to latest"}
              className="ui-pop absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border border-base-300 bg-base-100 p-2 text-base-content shadow-lg hover:bg-base-200 sm:right-5"
              onClick={() => {
                stickToBottom.current = true;
                endRef.current?.scrollIntoView({ behavior: "smooth" });
                setShowNew(false);
              }}
            >
              {showNew && <span className="rounded-full bg-primary px-2 text-[11px] font-medium text-primary-content">New</span>}
              <ChevronDown size={18} />
            </button>
          )}
        </div>
      )}
      {incomingPending ? (
        <RequestComposer />
      ) : blockedByMe ? (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-base-300 px-4 py-3 text-xs text-base-content/70 safe-bottom">
          <span>You blocked {selectedUser?.fullName}.</span>
          <button type="button" className="btn btn-xs btn-primary" onClick={() => setBlocked(selectedUser._id, false)}>Unblock</button>
        </div>
      ) : blockedAsDeclinedInitiator ? (
        <div className="shrink-0 border-t border-base-300 px-4 py-3 text-center text-xs text-base-content/60">
          {selectedUser?.fullName || "This user"} rejected your request. You can&apos;t message them unless they message you first.
        </div>
      ) : (
        <>
          {iRejectedThem && (
            <p className="shrink-0 border-t border-base-300 bg-base-200/60 px-4 py-2 text-center text-[11px] text-base-content/70">
              You rejected {selectedUser?.fullName}&apos;s request, so they can&apos;t message you. Sending a message reopens the chat for both of you.
            </p>
          )}
          <MessageInput />
        </>
      )}
      <MoodPicker />
      <MediaViewer />
      <ForwardDialog />
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-primary bg-base-100/85">
          <p className="flex items-center gap-2 text-sm font-medium"><Paperclip size={18} /> Drop to attach</p>
        </div>
      )}
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
