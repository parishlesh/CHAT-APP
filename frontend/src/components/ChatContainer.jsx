import { useEffect, useRef } from "react";
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
import { Search, X } from "lucide-react";

const ChatContainer = () => {
  const {
    messages, getMessages, isMessageLoading, selectedUser, pruneExpired,
    messageSearch, messageMatchIds, searchMessages, messageSearchOpen, setMessageSearchOpen,
  } = useChatStore();
  const { theme } = useThemeStore();
  const { mine, getConversationMood, clearConversationMood } = useConversationThemeStore();
  const conversationTheme = themeForMood(mine?.mood, theme);
  const endRef = useRef(null);

  useEffect(() => {
    if (!selectedUser?._id) return;
    getMessages(selectedUser._id);
    getConversationMood(selectedUser._id);
    return () => clearConversationMood();
  }, [selectedUser?._id, getMessages, getConversationMood, clearConversationMood]);

  useEffect(() => {
    const timer = setInterval(pruneExpired, 30000);
    return () => clearInterval(timer);
  }, [pruneExpired]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isMessageLoading]);

  useEffect(() => {
    if (messageSearchOpen) document.getElementById("conversation-message-search")?.focus();
  }, [messageSearchOpen]);

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
          {messageSearch && <span className="text-xs opacity-60">{messageMatchIds.length}</span>}
          <button type="button" className="p-1" aria-label="Close search" onClick={() => setMessageSearchOpen(false)}>
            <X size={16} />
          </button>
        </label>
      )}
      {isMessageLoading ? (
        <MessageSkeleton />
      ) : (
        <ScrollContainer className="min-h-0 flex-1">
          <div className="flex min-h-full flex-col justify-end space-y-1.5 px-3 py-3 sm:px-6">
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
      )}
      <MessageInput />
      <MoodPicker />
    </div>
  );
};

export default ChatContainer;
