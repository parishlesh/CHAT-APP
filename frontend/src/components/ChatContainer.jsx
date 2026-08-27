import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useThemeStore } from "../store/useThemeStore";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { themeForMood } from "../lib/moods";
import ChatHeader from "./ChatHeader";
import MoodBanner from "./MoodBanner";
import MoodPicker from "./MoodPicker";
import MessageInput from "./MessageInput";
import MessageBubble from "./MessageBubble";
import MessageSkeleton from "./skeleton/MessageSkeleton";
import ScrollContainer from "./scrollbarContainer";
import { ChevronDown, Search, X } from "lucide-react";

const ChatContainer = () => {
  const {
    messages, getMessages, loadOlderMessages, isMessageLoading, isLoadingOlder, selectedUser, pruneExpired,
    messageSearch, messageMatchIds, searchMessages, messageSearchOpen, setMessageSearchOpen, goToMatch, matchIndex,
  } = useChatStore();
  const { theme } = useThemeStore();
  const { mine, getConversationMood, clearConversationMood } = useConversationThemeStore();
  const conversationTheme = themeForMood(mine?.mood, theme);
  const endRef = useRef(null);
  const scrollerRef = useRef(null);
  const stickToBottom = useRef(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!selectedUser?._id) return;
    stickToBottom.current = true;
    getMessages(selectedUser._id);
    getConversationMood(selectedUser._id);
    return () => clearConversationMood();
  }, [selectedUser?._id, getMessages, getConversationMood, clearConversationMood]);

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

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-base-100" data-theme={conversationTheme}>
      <ChatHeader />
      <MoodBanner />
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
            <div className="flex min-h-full flex-col justify-end space-y-1.5 px-3 py-3 sm:px-6">
              {isLoadingOlder && <p className="py-2 text-center text-xs text-base-content/50">Loading earlier messages…</p>}
              {messages?.length > 0 ? (
                messages.map((message) => <MessageBubble key={message._id} message={message} />)
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
      <MessageInput />
      <MoodPicker />
    </div>
  );
};

export default ChatContainer;
