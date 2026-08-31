import { useEffect, useState } from "react";
import { ArrowLeft, MoreVertical, Search } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { getMoodMeta } from "../lib/moods";
import { getVibeMeta } from "../config/conversationVibes";
import { CONVERSATION_MODES, RELATIONSHIP_TYPES, findMeta, formatAvailability } from "../config/conversationExtras";
import ConversationSettings from "./ConversationSettings";

const ChatHeader = () => {
  const { conversationVibe, relationshipType, relationshipCustom, theirMode, selectedUser, setSelectedUser, typing, setMessageSearchOpen } = useChatStore();
  const { onlineUsers } = useAuth();
  const { theirs, theirAvailability } = useConversationThemeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const theirMood = getMoodMeta(theirs?.mood);
  const vibe = getVibeMeta(conversationVibe);
  const relationship = findMeta(RELATIONSHIP_TYPES, relationshipType);
  const modeMeta = findMeta(CONVERSATION_MODES, theirMode?.key);
  const availability = formatAvailability(theirAvailability);

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

  const relationshipLabel = relationship
    ? `${relationship.emoji} ${relationship.key === "custom" && relationshipCustom ? relationshipCustom : relationship.label}`
    : null;

  return (
    <div className="relative flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-base-300 bg-base-100 px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={() => setSelectedUser(null)}
          className="ui-press rounded-full p-2 hover:bg-base-200 md:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <img
          src={selectedUser.profilePic || "/avatar.svg"}
          alt={selectedUser.fullName}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{selectedUser.fullName}</p>
          <p className="truncate text-xs text-base-content/60">{status}{availability ? ` · ${availability}` : ""}</p>
          {(theirMood || modeMeta) && (
            <p className="truncate text-[11px] text-base-content/70">
              {theirMood ? `Mood ${theirMood.emoji} ${theirMood.label}` : ""}
              {theirMood && modeMeta ? " · " : ""}
              {modeMeta ? `${modeMeta.emoji} ${modeMeta.label}` : ""}
            </p>
          )}
          <div className="hidden items-center gap-1 overflow-hidden sm:flex">
            <span className="truncate rounded-full bg-base-200 px-1.5 py-0.5 text-[10px]">Vibe {vibe.emoji} {vibe.label}</span>
            {relationshipLabel && <span className="truncate rounded-full bg-base-200 px-1.5 py-0.5 text-[10px]">{relationshipLabel}</span>}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          className="ui-press rounded-full p-2 hover:bg-base-200"
          aria-label="Search messages"
          onClick={() => setMessageSearchOpen(true)}
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          className="ui-press rounded-full p-2 hover:bg-base-200"
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
          <ConversationSettings onClose={() => setSettingsOpen(false)} onSearch={() => setMessageSearchOpen(true)} />
        </>
      )}
    </div>
  );
};

export default ChatHeader;
