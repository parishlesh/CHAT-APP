import React from "react";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();

  if (!selectedUser) {
    return <div className="p-4 text-center text-gray-500">Select a user to start chatting</div>;
  }

  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-300 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex items-center gap-3">
        {/* Back Button for Mobile View */}
        <button
          onClick={() => setSelectedUser(null)}
          className="lg:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="size-6 text-gray-600 dark:text-white" />
        </button>
        
        {/* User Info */}
        <img
          src={selectedUser.profilePic || "/avatar.png"}
          alt={selectedUser.fullName}
          className="size-10 object-cover rounded-full"
        />
        <div>
          <div className="font-medium text-gray-900 dark:text-white">{selectedUser.fullName}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {selectedUser.isOnline ? "Online" : "Offline"}
          </div>
        </div>
      </div>
      
      {/* More Options Button */}
      <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
        <MoreVertical className="size-6 text-gray-600 dark:text-white" />
      </button>
    </div>
  );
};

export default ChatHeader;
