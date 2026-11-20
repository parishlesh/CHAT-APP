import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MoreVertical, Search } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { getMoodMeta } from "../lib/moods";
import { getVibeMeta } from "../config/conversationVibes";
import { CONVERSATION_MODES, RELATIONSHIP_TYPES, findMeta, formatAvailability } from "../config/conversationExtras";
import ConversationSettings from "./ConversationSettings";
import { formatLastSeen } from "../lib/time";

const ChatHeader = () => {
  const { conversationVibe, relationshipType, relationshipCustom, theirMode, selectedUser, setSelectedUser, typing, setMessageSearchOpen } = useChatStore();
  const { onlineUsers } = useAuth();
  const { theirs, theirAvailability } = useConversationThemeStore();
  const navigate = useNavigate();
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
      {typing === "recording" ? "recording audio…" : "typing…"}
      <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  ) : onlineUsers.some((id) => String(id) === String(selectedUser._id)) ? "Online" : (formatLastSeen(selectedUser.lastSeen) || "Offline");

  const relationshipLabel = relationship
    ? `${relationship.emoji} ${relationship.key === "custom" && relationshipCustom ? relationshipCustom : relationship.label}`
    : null;

  const online = onlineUsers.some((id) => String(id) === String(selectedUser._id));
  const extras = [
    availability,
    theirMood ? `${theirMood.emoji} ${theirMood.label}` : null,
    modeMeta ? `${modeMeta.emoji} ${modeMeta.label}` : null,
  ].filter(Boolean);

  return (
    <div className="relative flex h-14 shrink-0 items-center justify-between gap-1 border-b border-base-300 bg-base-100 px-1 sm:h-16 sm:gap-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <button
          onClick={() => setSelectedUser(null)}
          className="ui-press shrink-0 rounded-full p-2 hover:bg-base-200 md:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {/* Tapping the contact opens their profile (contact info), like other chat apps. */}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pr-2 text-left hover:bg-base-200/60 sm:gap-3"
          onClick={() => navigate(`/u/${selectedUser._id}`)}
          aria-label={`View ${selectedUser.fullName}'s profile`}
        >
          <span className="relative shrink-0">
            <img
              src={selectedUser.profilePic || "/avatar.svg"}
              alt=""
              className="h-9 w-9 rounded-full object-cover sm:h-10 sm:w-10"
            />
            {online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-base-100" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-semibold leading-tight">{selectedUser.fullName}</span>
              {vibe.key !== "neutral" && (
                <span className="hidden shrink-0 rounded-full bg-base-200 px-1.5 py-0.5 text-[10px] font-medium sm:inline" title="Conversation vibe">{vibe.emoji} {vibe.label}</span>
              )}
              {relationshipLabel && <span className="hidden shrink-0 truncate rounded-full bg-base-200 px-1.5 py-0.5 text-[10px] font-medium lg:inline">{relationshipLabel}</span>}
            </span>
            <span className={`block truncate text-xs ${typing ? "text-primary" : online ? "text-success" : "text-base-content/60"}`}>
              {status}
              {!typing && extras.length > 0 && <span className="text-base-content/60"> · {extras.join(" · ")}</span>}
            </span>
          </span>
        </button>
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
          <button type="button" className="ui-fade fixed inset-0 z-20 cursor-default bg-black/40 sm:bg-transparent" aria-label="Close settings" onClick={() => setSettingsOpen(false)} />
          <ConversationSettings onClose={() => setSettingsOpen(false)} onSearch={() => setMessageSearchOpen(true)} />
        </>
      )}
    </div>
  );
};

export default ChatHeader;
