import { MessageSquare } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";

const NoChatSelected = () => {
  const { theme } = useThemeStore();

  return (
    <div className="hidden h-full flex-col items-center justify-center bg-base-200/40 px-6 text-center md:flex" data-theme={theme}>
      <MessageSquare className="mb-3 h-12 w-12 text-base-content/30" />
      <h2 className="text-lg font-medium text-base-content">Select a conversation to start chatting</h2>
    </div>
  );
};

export default NoChatSelected;
