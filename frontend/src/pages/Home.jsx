import { useChatStore } from '../store/useChatStore';
import Sidebar from '../components/Sidebar';
import NoChatSelected from '../components/NoChatSelected';
import ChatContainer from '../components/ChatContainer';


const Home = () => {
  const { selectedUser } = useChatStore();


  return (
 <div className="flex h-screen w-full overflow-hidden">
      <main className="min-w-0 flex-1">
        {!selectedUser ? <NoChatSelected /> : <ChatContainer />}
      </main>
      <Sidebar />
 </div>
  );
};

export default Home;
