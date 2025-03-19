import { MessageSquare } from "lucide-react";

const NoChatSelected = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center px-4">
      <MessageSquare className="size-16 text-gray-400 animate-pulse" />
      <h2 className="text-2xl font-semibold text-gray-700 mt-4">
      Welcome 
      </h2>
      <p className="text-gray-500 mt-2 max-w-sm">
        Select a conversation from your contacts to start chatting.
      </p>
    </div>
  );
};

export default NoChatSelected;
