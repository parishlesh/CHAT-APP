import { useEffect, useState } from "react";
import { LogOut, MessageCircle, Search, Settings, User, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useThemeStore } from "../store/useThemeStore";
import { formatChatListTime } from "../lib/time";
import { getMoodMeta } from "../lib/moods";
import { formatAvailability } from "../config/conversationExtras";

const Sidebar = () => {
  const { chatList, requests, searchResults, activeTab, setActiveTab, selectedUser, setSelectedUser, getChats, getRequests, searchUsers, respondToRequest, subscribeToMessages, unsubscribeFromMessages, requestBusy } = useChatStore();
  const { onlineUsers, authUser, isLogout } = useAuth();
  const { appliedAppTheme } = useThemeStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    getChats();
    getRequests();
    subscribeToMessages();
    return unsubscribeFromMessages;
  }, [getChats, getRequests, subscribeToMessages, unsubscribeFromMessages]);
  useEffect(() => {
    const timer = setTimeout(() => searchUsers(query), 250);
    return () => clearTimeout(timer);
  }, [query, searchUsers]);

  const rows = query.trim()
    ? searchResults.map((user) => ({ user }))
    : activeTab === "chats"
      ? chatList.map((chat) => ({ user: chat.user, chat }))
      : requests.map((request) => ({ user: request.user, request }));

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-base-300 bg-base-100" data-theme={appliedAppTheme}>
      <div className="shrink-0 border-b border-base-300 px-3 pb-3 pt-3">
        <div className="mb-3 flex items-center justify-between md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <img src={authUser?.profilePic || "/avatar.png"} alt="" className="h-8 w-8 rounded-full object-cover" />
            <span className="truncate font-semibold">{authUser?.fullName}</span>
          </div>
          <div className="flex items-center">
            <Link to="/settings" className="ui-press rounded-full p-2 hover:bg-base-200" aria-label="Settings"><Settings size={18} /></Link>
            <Link to="/profile" className="ui-press rounded-full p-2 hover:bg-base-200" aria-label="Profile"><User size={18} /></Link>
            <button type="button" onClick={isLogout} className="ui-press rounded-full p-2 text-error hover:bg-base-200" aria-label="Logout"><LogOut size={18} /></button>
          </div>
        </div>
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
          <input
            id="user-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="w-full rounded-lg bg-base-200 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-base-content/50"
            aria-label="Search users by name, username, or email"
          />
        </label>
        {!query.trim() && (
          <div className="mt-3 flex">
            <button type="button" onClick={() => setActiveTab("chats")} className={`flex-1 border-b-2 py-1.5 text-sm ${activeTab === "chats" ? "border-primary font-medium" : "border-transparent text-base-content/60"}`}>
              <span className="inline-flex items-center gap-1"><MessageCircle size={14} /> Chats</span>
            </button>
            <button type="button" onClick={() => setActiveTab("requests")} className={`flex-1 border-b-2 py-1.5 text-sm ${activeTab === "requests" ? "border-primary font-medium" : "border-transparent text-base-content/60"}`}>
              <span className="inline-flex items-center gap-1"><Users size={14} /> Requests {requests.length ? requests.length : ""}</span>
            </button>
          </div>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.map(({ user, request, chat }) => {
          const selected = selectedUser?._id === user._id;
          const preview = query.trim()
            ? `@${user.username}`
            : request
              ? "New conversation request"
              : chat?.status === "pending"
                ? "Waiting for them to accept"
                : chat?.status === "declined"
                  ? (chat.lastPreview || "Request declined")
                  : chat?.lastPreview || "No messages yet";
          const availability = formatAvailability(user.availability);
          const time = chat?.lastMessage?.createdAt || chat?.updatedAt;
          return (
            <li key={request?._id || chat?._id || user._id} className={selected ? "bg-base-200" : "hover:bg-base-200/70"}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button type="button" onClick={() => setSelectedUser(user)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div className="relative shrink-0">
                    <img src={user.profilePic || "/avatar.png"} alt="" className="h-11 w-11 rounded-full object-cover" />
                    {onlineUsers.includes(user._id) && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-base-100" />}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="truncate text-sm">{getMoodMeta(user.mood) ? `${getMoodMeta(user.mood).emoji} ` : ""}{user.fullName}</b>
                      {time && !request && !query.trim() && <span className="shrink-0 text-[11px] text-base-content/50">{formatChatListTime(time)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <small className="block truncate text-xs text-base-content/60">{availability ? `${availability} · ${preview}` : preview}</small>
                      {!!chat?.unreadCount && <span className="badge badge-primary badge-xs shrink-0">{chat.unreadCount}</span>}
                    </span>
                  </span>
                </button>
                {request && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label="Accept" disabled={requestBusy} onClick={() => respondToRequest(request._id, "accept")} className="btn btn-success btn-xs">Accept</button>
                    <button type="button" aria-label="Reject" disabled={requestBusy} onClick={() => respondToRequest(request._id, "reject")} className="btn btn-ghost btn-xs">Reject</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!rows.length && (
        <p className="px-4 py-8 text-center text-sm text-base-content/50">
          {query ? "No people found" : activeTab === "requests" ? "No pending requests" : "No chats yet"}
        </p>
      )}
    </aside>
  );
};

export default Sidebar;
