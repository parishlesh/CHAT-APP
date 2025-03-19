import React, { useEffect } from 'react'
import { useChatStore } from '../store/useChatStore'
import ChatHeader from './chatHeader'
import MessageInput from './messageInput'
import MessageSkeleton from './skeleton/MessageSkeleton'

const ChatContainer = () => {
    const {messages, getMessages, isMessagesLoading, selectedUser}=useChatStore()

    useEffect(() => {
        if (selectedUser?._id) {
            getMessages(selectedUser._id);
        }
    }, [selectedUser?._id, getMessages]);
    

if(isMessagesLoading){
    return
     <div className='flex-1 flex flex-col overflow-auto'><ChatHeader/>
    <MessageSkeleton/>
    <messageInput/>
    </div>
}


  return (
    <div>
    <ChatHeader/>
<p>meaages</p>
    <MessageInput/>
    </div>
  )
}

export default ChatContainer
