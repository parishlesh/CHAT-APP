import React, { useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useAuth } from '../store/useAuth';
import { useThemeStore } from '../store/useThemeStore';
import ChatHeader from './chatHeader';
import MessageInput from './messageInput';
import MessageSkeleton from './skeleton/MessageSkeleton';

const ChatContainer = () => {
  const { messages, getMessages, isMessagesLoading, selectedUser } = useChatStore();
  const { authUser } = useAuth();
  const { theme } = useThemeStore();

  useEffect(() => {
    if (selectedUser?._id) {
      getMessages(selectedUser._id);
    }
  }, [selectedUser?._id, getMessages]);

  if (isMessagesLoading) {
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
    <div 
      className="flex flex-col h-full" 
      data-theme={theme}
    >
      <ChatHeader />
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-base-100 text-base-content">
        {messages?.length > 0 ? (
          messages.map((message) => (
            <div
              key={message._id}
              className={`flex ${message.senderId === authUser._id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex items-start gap-2.5 ${
                  message.senderId === authUser._id ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <div className="avatar">
                  <div className="w-10 h-10 rounded-full border border-base-300">
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
                    max-w-[70%] p-3 rounded-2xl 
                    ${message.senderId === authUser._id 
                      ? "bg-primary text-primary-content" 
                      : "bg-base-200 text-base-content"}
                  `}
                >
                  {message.text && <p>{message.text}</p>}
                  {message.image && (
                    <img 
                      src={message.image} 
                      alt="Sent" 
                      className="max-w-full h-auto rounded-lg mt-2"
                    />
                  )}
                  <div className="text-xs mt-1 opacity-70">
                    {formatDate(message.createdAt)}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-base-content/50 mt-10">
            No messages yet. Start a conversation!
          </div>
        )}
      </div>
      <MessageInput />
    </div>
  );
};

export default ChatContainer;