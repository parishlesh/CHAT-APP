import { useEffect, useState } from "react";
import { ArrowLeft, Bell, BellOff, ChevronRight, MoreVertical, Search, Smile } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { getMoodMeta } from "../lib/moods";
import { getVibeMeta } from "../config/conversationVibes";
import { requestNotificationPermission } from "../lib/notify";

const ChatHeader = () => {
  const { conversationVibe, selectedUser, setSelectedUser, typing, setMessageSearchOpen, openVibePicker } = useChatStore();
  const { onlineUsers } = useAuth();
  const { mine, theirs, muted, openMoodPicker, setConversationMute } = useConversationThemeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const myMood = getMoodMeta(mine?.mood);
  const theirMood = getMoodMeta(theirs?.mood);
  const vibe = getVibeMeta(conversationVibe);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event) => { if (event.key === "Escape") setSettingsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  if (!selectedUser) {
    return <div className="p-4 text-center text-base-content/50">Select a user to start chatting</div>;
  }

  const status = typing ? (
    <span className="flex items-center gap-1">
      typing...
      <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  ) : onlineUsers.some((id) => String(id) === String(selectedUser._id)) ? "Online" : "Offline";

  return (
    <div className="relative flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-base-300 bg-base-100 px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={() => setSelectedUser(null)}
          className="rounded-full p-2 hover:bg-base-200 md:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <img
          src={selectedUser.profilePic || "/avatar.png"}
          alt={selectedUser.fullName}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{selectedUser.fullName}</p>
          <p className="truncate text-xs text-base-content/60">{status}</p>
          {theirMood && (
            <p className="truncate text-[11px] text-base-content/70">
              Mood {theirMood.emoji} {theirMood.label}
            </p>
          )}
          <p className="truncate text-[11px] text-base-content/70">
            Vibe {vibe.emoji} {vibe.label}
          </p>
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
          aria-haspopup="menu"
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
            <div className="px-3 py-1.5 text-xs text-base-content/60">
              Conversation vibe
              <p className="text-sm text-base-content">{vibe.emoji} {vibe.label}</p>
            </div>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={() => { setSettingsOpen(false); openVibePicker(); }}
            >
              <span>Change vibe</span>
              <ChevronRight size={16} className="opacity-50" />
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={() => { setSettingsOpen(false); openMoodPicker(); }}
            >
              <span className="flex items-center gap-2"><Smile size={16} /> How are you feeling?</span>
              <span className="text-xs opacity-70">{myMood ? `${myMood.emoji} ${myMood.label}` : "Set mood"}</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={() => { setSettingsOpen(false); setConversationMute(selectedUser._id, !muted); }}
            >
              <span className="flex items-center gap-2">{muted ? <Bell size={16} /> : <BellOff size={16} />} {muted ? "Unmute" : "Mute"}</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={async () => { setSettingsOpen(false); await requestNotificationPermission(); }}
            >
              <Bell size={16} /> Desktop alerts
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
