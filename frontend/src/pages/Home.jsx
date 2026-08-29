import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const Home = () => {
  const { selectedUser } = useChatStore();

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className={`${selectedUser ? "hidden md:flex" : "flex"} h-full w-full shrink-0 flex-col md:w-80 lg:w-96`}>
        <Sidebar />
      </div>
      <main className={`${selectedUser ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
        {!selectedUser ? <NoChatSelected /> : <ChatContainer key={selectedUser._id} />}
      </main>
    </div>
  );
};

export default Home;
