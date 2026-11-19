import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

const STORAGE_KEY = "vibelink-vibe-prompt-dismissed";

const readDismissed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
};

// One slim hint per chat, shown until the vibe is set or the user dismisses it (remembered on this device).
const VibePrompt = () => {
  const { selectedUser, openConversationId, conversationVibe, vibePromptHiddenFor, openVibePicker, dismissVibePrompt } = useChatStore();
  const [dismissed, setDismissed] = useState(readDismissed);
  const conversationId = openConversationId;
  if (!selectedUser || !conversationId) return null;
  if (conversationVibe !== "neutral" || vibePromptHiddenFor[conversationId] || dismissed.has(String(conversationId))) return null;

  const dismiss = () => {
    const next = new Set(dismissed).add(String(conversationId));
    setDismissed(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next].slice(-200))); } catch { /* storage full */ }
    dismissVibePrompt();
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 py-1.5 text-xs">
      <Sparkles size={14} className="shrink-0 text-primary" aria-hidden="true" />
      <button type="button" className="min-w-0 flex-1 truncate text-left text-base-content/80 hover:text-base-content" onClick={openVibePicker}>
        Give this chat a vibe — <span className="font-medium text-primary">choose one</span>
      </button>
      <button type="button" className="ui-press shrink-0 rounded-full p-1 hover:bg-base-200" aria-label="Dismiss vibe prompt" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
};

export default VibePrompt;
