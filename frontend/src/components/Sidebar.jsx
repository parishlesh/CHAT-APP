import { useEffect, useState } from "react";
import { Lock, LogOut, MessageCircle, Search, Settings, User, UserPlus, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useThemeStore } from "../store/useThemeStore";
import { formatChatListTime } from "../lib/time";
import { getMoodMeta } from "../lib/moods";
import { formatAvailability } from "../config/conversationExtras";
import { getVibeMeta } from "../config/conversationVibes";

const Sidebar = () => {
  const {
    chatList, requests, searchResults, activeTab, setActiveTab, selectedUser, setSelectedUser, getChats, getRequests, searchUsers, respondToRequest, subscribeToMessages, unsubscribeFromMessages, requestBusy, drafts, rejected, getRejected, chatsLoaded,
  } = useChatStore(useShallow((state) => ({
    chatList: state.chatList,
    requests: state.requests,
    searchResults: state.searchResults,
    activeTab: state.activeTab,
    setActiveTab: state.setActiveTab,
    selectedUser: state.selectedUser,
    setSelectedUser: state.setSelectedUser,
    getChats: state.getChats,
    getRequests: state.getRequests,
    searchUsers: state.searchUsers,
    respondToRequest: state.respondToRequest,
    subscribeToMessages: state.subscribeToMessages,
    unsubscribeFromMessages: state.unsubscribeFromMessages,
    requestBusy: state.requestBusy,
    drafts: state.drafts,
    rejected: state.rejected,
    getRejected: state.getRejected,
    chatsLoaded: state.chatsLoaded,
  })));
  const { onlineUsers, authUser, isLogout } = useAuth();
  const { appliedAppTheme } = useThemeStore();
  const [query, setQuery] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const focusSearch = () => document.getElementById("user-search")?.focus();

  // Logout sits next to other icons on phones, so ask once instead of logging out on a stray tap.
  useEffect(() => {
    if (!confirmLogout) return undefined;
    const timer = setTimeout(() => setConfirmLogout(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmLogout]);

  useEffect(() => {
    getChats();
    getRequests();
    getRejected();
    subscribeToMessages();
    return unsubscribeFromMessages;
  }, [getChats, getRequests, getRejected, subscribeToMessages, unsubscribeFromMessages]);
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
            <img src={authUser?.profilePic || "/avatar.svg"} alt="" className="h-8 w-8 rounded-full object-cover" />
            <span className="truncate font-semibold">{authUser?.fullName}</span>
          </div>
          <div className="flex items-center">
            <Link to="/settings" className="ui-press rounded-full p-2 hover:bg-base-200" aria-label="Settings"><Settings size={18} /></Link>
            <Link to="/profile" className="ui-press rounded-full p-2 hover:bg-base-200" aria-label="Profile"><User size={18} /></Link>
            {confirmLogout ? (
              <button type="button" onClick={isLogout} className="ui-pop ml-1 rounded-full bg-error px-3 py-1 text-xs font-medium text-error-content">Log out?</button>
            ) : (
              <button type="button" onClick={() => setConfirmLogout(true)} className="ui-press rounded-full p-2 text-error hover:bg-base-200" aria-label="Logout"><LogOut size={18} /></button>
            )}
          </div>
        </div>
        <h1 className="mb-3 hidden text-xl font-bold md:block">Chats</h1>
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
          <input
            id="user-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            className="w-full rounded-full bg-base-200 py-2 pl-9 pr-9 text-base outline-none ring-primary/40 placeholder:text-base-content/50 focus:ring-2 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            aria-label="Search users by name or username"
          />
          {query && (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-base-content/60 hover:bg-base-300" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </label>
        {!query.trim() && (
          <div className="mt-3 flex gap-1 rounded-full bg-base-200 p-1" role="tablist" aria-label="Chat lists">
            {[
              { key: "chats", label: "Chats", Icon: MessageCircle, count: chatList.reduce((sum, chat) => sum + (chat.unreadCount ? 1 : 0), 0) },
              { key: "requests", label: "Requests", Icon: Users, count: requests.length },
            ].map(({ key, label, Icon, count }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm transition-colors ${activeTab === key ? "bg-base-100 font-medium shadow-sm" : "text-base-content/60 hover:text-base-content"}`}
              >
                <Icon size={14} /> {label}
                {count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-content">{count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {!chatsLoaded && !query.trim() && activeTab === "chats" && Array.from({ length: 6 }, (_, index) => (
          <li key={`skeleton-${index}`} className="flex items-center gap-3 px-3 py-3" aria-hidden="true">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-base-300" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/2 animate-pulse rounded bg-base-300" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-base-200" />
            </div>
          </li>
        ))}
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
          const draft = !selected && !query.trim() && !chat?.locked && drafts[String(user._id)];
          const vibe = chat?.conversationVibe && chat.conversationVibe !== "neutral" ? getVibeMeta(chat.conversationVibe) : null;
          const availability = formatAvailability(user.availability);
          const time = chat?.lastMessage?.createdAt || chat?.updatedAt;
          const unread = Boolean(chat?.unreadCount);
          return (
            <li key={request?._id || chat?._id || user._id} className="px-1.5">
              <div className={`flex items-center gap-2 rounded-xl px-2 py-2.5 transition-colors ${selected ? "bg-base-200" : "hover:bg-base-200/70"}`}>
                <button type="button" onClick={() => setSelectedUser(user)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-current={selected ? "true" : undefined}>
                  <div className="relative shrink-0">
                    <img src={user.profilePic || "/avatar.svg"} alt="" className="h-12 w-12 rounded-full object-cover" />
                    {onlineUsers.includes(user._id) && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-base-100" />}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`flex min-w-0 items-center gap-1 truncate text-[15px] ${unread ? "font-bold" : "font-semibold"}`}>
                        <span className="truncate">{user.fullName}{getMoodMeta(user.mood) ? ` ${getMoodMeta(user.mood).emoji}` : ""}</span>
                        {chat?.locked && <Lock size={12} className="shrink-0 text-base-content/50" aria-label="Locked chat" />}
                      </span>
                      {time && !request && !query.trim() && <span className={`shrink-0 text-[11px] ${unread ? "font-semibold text-primary" : "text-base-content/50"}`}>{formatChatListTime(time)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <small className={`block truncate text-[13px] ${unread ? "font-medium text-base-content" : "text-base-content/60"}`}>
                        {vibe && <span title={`Vibe: ${vibe.label}`}>{vibe.emoji} </span>}
                        {draft
                          ? <><span className="font-medium text-error">Draft:</span> {draft}</>
                          : availability ? `${availability} · ${preview}` : preview}
                      </small>
                      {unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-content">{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</span>}
                    </span>
                  </span>
                </button>
                {request && (
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <button type="button" aria-label="Accept" disabled={requestBusy} onClick={() => respondToRequest(request._id, "accept")} className="btn btn-success btn-xs">Accept</button>
                    <button type="button" aria-label="Reject" disabled={requestBusy} onClick={() => respondToRequest(request._id, "reject")} className="btn btn-ghost btn-xs">Reject</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {!rows.length && (chatsLoaded || query.trim() || activeTab !== "chats") && !(activeTab === "requests" && !query.trim() && rejected.length) && (
          <li className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="rounded-full bg-base-200 p-4 text-base-content/60">
              {query ? <Search size={24} /> : activeTab === "requests" ? <Users size={24} /> : <MessageCircle size={24} />}
            </span>
            <div>
              <p className="font-medium">{query ? "No people found" : activeTab === "requests" ? "No pending requests" : "No chats yet"}</p>
              <p className="mt-1 text-sm text-base-content/60">
                {query ? "Try a name or username." : activeTab === "requests" ? "When someone new messages you, it shows up here." : "Find someone by name or username to start talking."}
              </p>
            </div>
            {!query && activeTab === "chats" && (
              <button type="button" className="btn btn-primary btn-sm gap-1.5" onClick={focusSearch}>
                <UserPlus size={16} /> Find people
              </button>
            )}
          </li>
        )}
      </ul>

      {activeTab === "requests" && !query.trim() && rejected.length > 0 && (
        <div className="shrink-0 border-t border-base-300">
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">Rejected · only you can reopen</p>
          <ul className="max-h-64 overflow-y-auto">
            {rejected.map((item) => (
              <li key={item._id} className={selectedUser?._id === item.user?._id ? "bg-base-200" : "hover:bg-base-200/70"}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <img src={item.user?.profilePic || "/avatar.svg"} alt="" className="h-9 w-9 rounded-full object-cover opacity-70" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{item.user?.fullName}</b>
                    <small className="block truncate text-xs text-base-content/60">They can&apos;t message you</small>
                  </span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelectedUser(item.user)}>Message</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
