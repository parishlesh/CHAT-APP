import { X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

const VibePrompt = () => {
  const { selectedUser, chatList, requests, vibePromptHiddenFor, openVibePicker, dismissVibePrompt } = useChatStore();
  if (!selectedUser) return null;
  const conversationId = chatList.find((chat) => String(chat.user?._id) === String(selectedUser._id))?._id
    || requests.find((request) => String(request.user?._id) === String(selectedUser._id))?._id;
  if (!conversationId || vibePromptHiddenFor[conversationId]) return null;

  return (
    <div className="flex items-start justify-between gap-2 border-b border-base-300 px-3 py-2 text-xs text-base-content/80">
      <button type="button" className="min-w-0 text-left" onClick={openVibePicker}>
        <p>Set the conversation vibe</p>
        <p className="mt-0.5 text-base-content/55">This is the personality of this chat, not your mood.</p>
      </button>
      <button type="button" className="shrink-0 rounded-full p-1 hover:bg-base-200" aria-label="Dismiss vibe prompt" onClick={dismissVibePrompt}>
        <X size={14} />
      </button>
    </div>
  );
};

export default VibePrompt;
