import React, { useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useAuth } from '../store/useAuth';
import ChatHeader from './chatHeader';
import MessageInput from './messageInput';
import MessageSkeleton from './skeleton/MessageSkeleton';

const ChatContainer = () => {
  const { messages, getMessages, isMessagesLoading, selectedUser } = useChatStore();
  const { authUser } = useAuth();

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

  return (
    <div>
      <ChatHeader />
      <div>
        {messages?.length > 0 ? (
          messages.map((message) => (
            <div
              key={message._id}
              className={`chat ${message.senderId === authUser._id ? "chat-end" : "chat-start"}`}
            >
              <div className="chat-image avatar">
                <div className="size-10 rounded-full border">
                  <img
                    src={message.senderId === authUser._id ? authUser.profilePic || "avatar.png" : selectedUser?.profilePic || "avatar.png"}
                    alt="profilePic"
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500">No messages yet</p>
        )}
      </div>
      <MessageInput />
    </div>
  );
};

export default ChatContainer;
