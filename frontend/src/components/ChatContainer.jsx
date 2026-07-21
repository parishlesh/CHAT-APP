import { useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useAuth } from '../store/useAuth';
import { useThemeStore } from '../store/useThemeStore';
import ChatHeader from './ChatHeader';
import MessageInput from './MessageInput';
import MessageSkeleton from './skeleton/MessageSkeleton';
import ScrollContainer from './scrollbarContainer';
import { Check, CheckCheck, Clock3, Pencil, Search, Trash2 } from "lucide-react";

const ChatContainer = () => {
  const { messages, getMessages, isMessageLoading, selectedUser, editMessage, deleteMessage, messageSearch, messageMatchIds, searchMessages, pruneExpired } = useChatStore();
  const { authUser } = useAuth();
  const { theme } = useThemeStore();

  useEffect(() => {
    if (selectedUser?._id) {
      getMessages(selectedUser._id);
    }

  }, [selectedUser?._id, getMessages]);

  useEffect(() => {
    const timer = setInterval(pruneExpired, 30000);
    return () => clearInterval(timer);
  }, [pruneExpired]);

  if (isMessageLoading) {
    return (
      <div className='flex-1 flex flex-col overflow-auto'>
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  };

  return (
    <div className=" flex flex-col w-full h-full items-center justify-center" data-theme={theme}>
      <ChatHeader />
      <label className="input input-bordered m-3 flex w-[calc(100%-1.5rem)] items-center gap-2">
        <Search size={17} />
        <input value={messageSearch} onChange={(event) => searchMessages(event.target.value)} placeholder="Search messages in this conversation" className="grow" />
        {messageSearch && <span className="text-xs">{messageMatchIds.length}</span>}
      </label>
      <ScrollContainer className=" w-full overflow-hidden">

      <div className="flex flex-col w-full p-6 space-y-4 text-base-content overflow-y-auto scrollbar-stealth">
        {messages?.length > 0 ? (
          messages.map((message) => (
            <div
            key={message._id}
            className={`flex ${message.senderId === authUser._id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex items-start gap-3 max-w-[70%] ${message.senderId === authUser._id ? "flex-row-reverse" : "flex-row"
                }`}
                >
                <div className="relative self-end">
                  <div className="w-12 h-12 rounded-full  overflow-hidden ">
                    <img
                      src={
                        message.senderId === authUser._id
                        ? (authUser.profilePic || "/avatar.png")
                        : (selectedUser?.profilePic || "/avatar.png")
                      }
                      alt="Profile"
                      className="rounded-full object-cover"
                      />
                  </div>
                </div>
                <div
                  className={`
                    p-4 rounded-2xl shadow-sm ${messageMatchIds.includes(message._id) ? "ring-2 ring-warning" : ""}
                    ${message.senderId === authUser._id
                      ? "bg-primary text-primary-content rounded-br-none"
                      : "bg-base-200 text-base-content rounded-bl-none"
                    }
                    `}
                    >
                  {message.deleted ? <p className="italic opacity-70">This message was deleted</p> : <>
                    {message.displayText && <p>{message.displayText}</p>}
                    {message.edited && <span className="text-xs opacity-60">(edited)</span>}
                  </>}
                  <div className="text-xs mt-2 opacity-60 text-right">
                    {formatDate(message.createdAt)}
                    {message.expiresAt && !message.deleted && <Clock3 size={13} className="inline ml-1" title="Disappearing message" />}
                    {message.senderId === authUser._id && (message.seen ? <CheckCheck size={15} className="inline ml-1 text-info" /> : <Check size={15} className="inline ml-1" />)}
                  </div>
                  {message.image && !message.deleted && (
                    <img
                    src={message.image}
                    alt="Sent"
                    className="max-w-full h-auto rounded-lg mt-3"
                    />
                  )}
                  {message.senderId === authUser._id && !message.deleted && <div className="mt-2 flex justify-end gap-2 opacity-70">
                    {message.displayText && <button onClick={() => { const next = window.prompt("Edit message", message.displayText); if (next?.trim()) editMessage(message._id, next); }} aria-label="Edit message"><Pencil size={14} /></button>}
                    <button onClick={() => deleteMessage(message._id)} aria-label="Delete message"><Trash2 size={14} /></button>
                  </div>}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-base-content/50 mt-12 font-medium">
            No messages yet. Start a conversation!
          </div>
        )}
      </div>
        </ScrollContainer>
      <MessageInput />
    </div>
  );
};

export default ChatContainer;
