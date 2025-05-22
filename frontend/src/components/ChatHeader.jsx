import React from "react";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();

  if (!selectedUser) {
    return <div className="p-4 text-center text-gray-500">Select a user to start chatting</div>;
  }

  return (
<div className="flex items-center justify-between  w-full py-4 shadow-sm bg-base-100"
  data-theme="{theme}">
  <div className="flex items-center gap-4">
    <button
      onClick={() => setSelectedUser(null)}
      className=" p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="Back"
    >
      <ArrowLeft className="w-6 h-6" />
    </button>
    
    <img
      src={selectedUser?.profilePic || "/avatar.png"}
      alt={selectedUser?.fullName}
      className="w-10 h-10 rounded-full object-cover"
    />
    
    <div>
      <p className="font-semibold">{selectedUser?.fullName}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {selectedUser?.isOnline ? "Online" : "Offline"}
      </p>
    </div>
  </div>

  <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="More options">
    <MoreVertical className="w-6 h-6" />
  </button>
</div>


  );
};

export default ChatHeader;
