import { useState } from "react";
import { ArrowLeft, MoreVertical, Search, Smile } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { getMoodMeta } from "../lib/moods";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser, typing, setMessageSearchOpen } = useChatStore();
  const { onlineUsers } = useAuth();
  const { mine, openMoodPicker } = useConversationThemeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const myMood = getMoodMeta(mine?.mood);

  if (!selectedUser) {
    return <div className="p-4 text-center text-base-content/50">Select a user to start chatting</div>;
  }

  const status = typing ? (
    <span className="flex items-center gap-1">
      typing
      <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  ) : onlineUsers.includes(selectedUser._id) ? "Online" : "Offline";

  return (
    <div className="relative flex h-14 shrink-0 items-center justify-between gap-2 border-b border-base-300 bg-base-100 px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={() => setSelectedUser(null)}
          className="rounded-full p-2 hover:bg-base-200"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <img
          src={selectedUser.profilePic || "/avatar.png"}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{selectedUser.fullName}</p>
          <p className="truncate text-xs text-base-content/60">{status}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          className="rounded-full p-2 hover:bg-base-200"
          aria-label="Search messages"
          onClick={() => setMessageSearchOpen(true)}
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          className="rounded-full p-2 hover:bg-base-200"
          aria-label="More options"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {settingsOpen && (
        <>
          <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close settings" onClick={() => setSettingsOpen(false)} />
          <div className="absolute right-2 top-12 z-30 w-56 rounded-lg border border-base-300 bg-base-100 py-1 shadow-md">
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">Conversation settings</p>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={() => { setSettingsOpen(false); openMoodPicker(); }}
            >
              <span className="flex items-center gap-2"><Smile size={16} /> Mood</span>
              <span className="text-xs opacity-70">{myMood ? `${myMood.emoji} ${myMood.label}` : "Set mood"}</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={() => { setSettingsOpen(false); setMessageSearchOpen(true); }}
            >
              <Search size={16} /> Search
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatHeader;
