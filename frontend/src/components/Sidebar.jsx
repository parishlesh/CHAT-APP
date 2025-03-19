import React, { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import SidebarSkeleton from "./skeleton/SidebarSkeleton";
import { Users } from "lucide-react";

const Sidebar = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUserLoading } =
    useChatStore();

  const onlineUser = [];

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  if (isUserLoading) {
    return <SidebarSkeleton />;
  }

  return (
    <div className="w-1/4 min-w-[250px] border-r border-gray-300 bg-base-200 p-4 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4">Chats</h2>
      <div className="flex items-center gap-2">
        <Users className="size-6" />
        <span className="font-medium hidden lg:block">Contacts</span>
      </div>

      {isUserLoading ? (
        <Loader className="animate-spin mx-auto" />
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <button
              key={user._id}
              onClick={() => setSelectedUser(user)}
              className={`p-2 cursor-pointer rounded-lg ${
                selectedUser?._id === user._id
                  ? "bg-primary text-primary-content"
                  : "hover:bg-gray-100"
              } flex items-center gap-3`}
            >
              <div className="relative">
                <img
                  src={user.profilePic || "/avatar.png"}
                  alt={user.fullName}
                  className="size-12 object-cover rounded-full"
                />
                {onlineUser.includes(user._id) && (
                  <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-zinc-500" />
                )}
              </div>
              <div className="hidden lg:block text-left min-w-0">
                <div className="font-medium truncate">{user.fullName}</div>
                <div className="text-sm text-zinc-400">
                  {onlineUser.includes(user._id) ? "Online" : "Offline"}
                </div>
              </div>
            </button>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Sidebar;
