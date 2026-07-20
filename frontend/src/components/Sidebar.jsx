import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import SidebarSkeleton from "./skeleton/SidebarSkeleton";
import { Users } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import { useThemeStore } from "../store/useThemeStore";


const Sidebar = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUserLoading, setChatList } =
    useChatStore();

      const { theme } = useThemeStore();
      const { onlineUsers } = useAuth();

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const res = await axiosInstance.get("/messages/conversations");
        setChatList(res.data);
      } catch (error) {
        console.error("Failed to fetch chats:", error);
      }
    };

    fetchChats();
  }, [setChatList]);

  if (isUserLoading) {
    return <SidebarSkeleton />;
  }

  return (
    <div
  className="fixed right-0 w-[20%] min-w-[280px] h-screen border-l bg-base-100 p-4 overflow-y-auto shadow-lg"
  data-theme={theme}
>

  <h2 className="text-xl font-semibold mb-6">Chats</h2>


  <div className="flex items-center gap-2 mb-6">
    <Users className="w-6 h-6 text-primary" />
    <span className="font-semibold hidden lg:block">Contacts</span>
  </div>


  <div className="mb-4">
    <input
      type="text"
      placeholder="Search..."
      className="w-full border border-gray-300 py-2 px-4 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    />
  </div>

  <ul className="space-y-3">
    {users.map((user) => (
      <li key={user._id}>
        <button
          onClick={() => setSelectedUser(user)}
          className={`flex items-center gap-4 w-full p-3 rounded-lg transition duration-200 group
            ${
              selectedUser?._id === user._id
                ? "bg-primary text-primary-content font-semibold shadow"
                : "hover:bg-gray-100"
            }`}
        >
          <div className="relative">
            <img
              src={user.profilePic || "/avatar.png"}
              alt={user.fullName}
              className="w-12 h-12 rounded-full object-cover border border-gray-300"
            />
            {onlineUsers.includes(user._id) && (
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full ring-2 ring-white" />
            )}
          </div>
          
          <div className="flex flex-col min-w-0 text-left">
            <p className="font-medium truncate">{user.fullName}</p>
            <p className="text-sm text-gray-500 truncate">
              {onlineUsers.includes(user._id) ? "Online" : "Offline"}
            </p>
          </div>
        </button>
      </li>
    ))}
  </ul>
</div>
 
  );
};

export default Sidebar;
