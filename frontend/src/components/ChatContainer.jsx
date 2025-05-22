import React, { useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useAuth } from '../store/useAuth';
import { useThemeStore } from '../store/useThemeStore';
import ChatHeader from './chatHeader';
import MessageInput from './messageInput';
import MessageSkeleton from './skeleton/MessageSkeleton';
import ScrollContainer from './scrollbarContainer';

const ChatContainer = () => {
  const { messages, getMessages, isMessagesLoading, selectedUser, subscribeToMessages, unsubscribeFromMessages } = useChatStore();
  const { authUser } = useAuth();
  const { theme } = useThemeStore();

  useEffect(() => {
    if (selectedUser?._id) {
      getMessages(selectedUser._id);
    }

    subscribeToMessages();

    return () => unsubscribeFromMessages();

  }, [selectedUser?._id, getMessages, subscribeToMessages, unsubscribeFromMessages]);

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
    <div className=" flex flex-col w-full h-full items-center justify-center" data-theme={theme}>
      <ChatHeader />
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
                    p-4 rounded-2xl shadow-sm
                    ${message.senderId === authUser._id
                      ? "bg-primary text-primary-content rounded-br-none"
                      : "bg-base-200 text-base-content rounded-bl-none"
                    }
                    `}
                    >
                  {message.text && <p>{message.text}</p>}
                  <div className="text-xs mt-2 opacity-60 text-right">
                    {formatDate(message.createdAt)}
                  </div>
                  {message.image && (
                    <img
                    src={message.image}
                    alt="Sent"
                    className="max-w-full h-auto rounded-lg mt-3"
                    />
                  )}
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