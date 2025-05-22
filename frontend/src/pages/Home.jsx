import React from 'react';
import { useChatStore } from '../store/useChatStore';
import Sidebar from '../components/Sidebar';
import NoChatSelected from '../components/NoChatSelected';
import ChatContainer from '../components/ChatContainer';


const Home = () => {
  const { users, getUsers, isUserLoading, selectedUser, setSelectedUser, messages, getMessage, isMessageLoading } = useChatStore();


  return (
 <>
        {!selectedUser ? <NoChatSelected /> : <ChatContainer />}
      <Sidebar />
 </>
  );
};

export default Home;
