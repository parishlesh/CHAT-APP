import { Suspense, lazy } from "react";
import { useMatch } from "react-router-dom";
import { Loader } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const UserProfile = lazy(() => import("../components/UserProfile"));

// /            chat list + open chat
// /u/:userId   chat list + that person's profile (full screen on phones)
const Home = () => {
  const { selectedUser } = useChatStore();
  const profileUserId = useMatch("/u/:userId")?.params.userId;
  const showMain = Boolean(selectedUser || profileUserId);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className={`${showMain ? "hidden md:flex" : "flex"} h-full w-full min-w-0 shrink-0 flex-col md:w-80 lg:w-96`}>
        <Sidebar />
      </div>
      <main className={`${showMain ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
        {profileUserId ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader className="size-6 animate-spin text-primary" /></div>}>
            <UserProfile key={profileUserId} userId={profileUserId} />
          </Suspense>
        ) : !selectedUser ? <NoChatSelected /> : <ChatContainer key={selectedUser._id} />}
      </main>
    </div>
  );
};

export default Home;
