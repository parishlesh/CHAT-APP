import { MessageSquare } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";

const NoChatSelected = () => {


  const { theme } = useThemeStore();

  return (
    <div className="flex flex-col w-full items-center justify-center h-screen text-center px-4 bg-opacity-10"
      data-theme={theme}>
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
