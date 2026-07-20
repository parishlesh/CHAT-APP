import { useEffect, useState } from "react";
import { Check, MessageCircle, Search, Users, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useThemeStore } from "../store/useThemeStore";

const Sidebar = () => {
  const { chatList, requests, searchResults, activeTab, setActiveTab, setSelectedUser, getChats, getRequests, searchUsers, respondToRequest, subscribeToMessages, unsubscribeFromMessages } = useChatStore();
  const { onlineUsers } = useAuth(); const { theme } = useThemeStore(); const [query, setQuery] = useState("");
  useEffect(() => {
    getChats();
    getRequests();
    subscribeToMessages();
    return unsubscribeFromMessages;
  }, [getChats, getRequests, subscribeToMessages, unsubscribeFromMessages]);
  useEffect(() => { const timer = setTimeout(() => searchUsers(query), 250); return () => clearTimeout(timer); }, [query, searchUsers]);
  const rows = query.trim()
    ? searchResults.map((user) => ({ user }))
    : activeTab === "chats"
      ? chatList.map((chat) => ({ user: chat.user, chat }))
      : requests.map((request) => ({ user: request.user, request }));
  return <aside className="h-full w-80 shrink-0 border-l bg-base-100 p-4 overflow-y-auto shadow-lg" data-theme={theme}>
    <div className="sticky top-0 z-10 -mx-4 mb-5 border-b border-base-300 bg-base-100 px-4 pb-4 pt-1 shadow-sm">
      <label htmlFor="user-search" className="mb-2 block text-base font-bold text-base-content">Find people</label>
      <div className="relative">
        <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/60" />
        <input
          id="user-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, username, or email"
          className="block w-full rounded-lg border-2 border-primary bg-base-100 py-3 pl-11 pr-3 text-base text-base-content outline-none placeholder:text-base-content/50 focus:ring-2 focus:ring-primary"
          aria-label="Search users by name, username, or email"
        />
      </div>
      {query.trim() && <p className="mt-2 text-xs text-base-content/60">Select a user to start a conversation</p>}
    </div>
    <div className="flex gap-2 mb-4"><button onClick={() => setActiveTab("chats")} className={`btn btn-sm flex-1 ${activeTab === "chats" ? "btn-primary" : "btn-ghost"}`}><MessageCircle size={16} /> Chats</button><button onClick={() => setActiveTab("requests")} className={`btn btn-sm flex-1 ${activeTab === "requests" ? "btn-primary" : "btn-ghost"}`}><Users size={16} /> Requests {requests.length ? `(${requests.length})` : ""}</button></div>
    <ul className="space-y-2">{rows.map(({ user, request, chat }) => {
      const lastMessage = request ? request.lastMessage : chat?.lastMessage;
      return <li key={request?._id || user._id} className="rounded-lg hover:bg-base-200">
        <div className="flex items-center gap-3 p-2"><button onClick={() => setSelectedUser(user)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><div className="relative"><img src={user.profilePic || "/avatar.png"} alt="" className="w-11 h-11 rounded-full object-cover" />{onlineUsers.includes(user._id) && <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full ring-2 ring-base-100" />}</div><span className="min-w-0"><b className="block truncate">{user.fullName}</b><small className="block truncate text-base-content/60">@{user.username} · {user.email}</small></span></button>{request && <div className="flex gap-1"><button aria-label="Accept" onClick={() => respondToRequest(request._id, "accept")} className="btn btn-success btn-xs btn-square"><Check size={15} /></button><button aria-label="Reject" onClick={() => respondToRequest(request._id, "reject")} className="btn btn-error btn-xs btn-square"><X size={15} /></button></div>}</div>
        {lastMessage && <p className="text-xs px-2 pb-2 truncate text-base-content/60">{lastMessage.text || "Sent an image"}</p>}</li>;
    })}</ul>
    {!rows.length && <p className="text-center text-sm text-base-content/50 py-8">{query ? "No people found" : activeTab === "requests" ? "No pending requests" : "No chats yet"}</p>}
  </aside>;
};
export default Sidebar;
