import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { decryptText, encryptText } from "../lib/encryption";
import { notifyIncomingMessage } from "../lib/notify";
import { useAuth } from "./useAuth";
import { useConversationThemeStore } from "./useConversationThemeStore";

const sortChats = (items) => [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
const idsEqual = (a, b) => String(a) === String(b);
const hasMessage = (messages, id) => messages.some((message) => idsEqual(message._id, id));

const hydrate = async (message, peer) => {
  const me = useAuth.getState().authUser;
  const displayText = message.deleted ? "" : await decryptText(message.text, me, peer);
  let replyPreview = null;
  if (message.replyTo && typeof message.replyTo === "object" && message.replyTo._id) {
    replyPreview = {
      ...message.replyTo,
      displayText: message.replyTo.deleted ? "" : await decryptText(message.replyTo.text, me, peer),
    };
  }
  return { ...message, displayText, replyPreview, pending: false };
};

const lastPreview = async (chat, me) => {
  const last = chat.lastMessage;
  if (!last) return "";
  if (last.deleted) return "This message was deleted";
  if (last.image && !last.text) return "Photo";
  const text = await decryptText(last.text, me, chat.user);
  if (last.image) return text ? text : "Photo";
  return text;
};

const parseMessagePage = (data) => {
  if (Array.isArray(data)) return { messages: data, hasMore: false };
  return { messages: data?.messages || [], hasMore: Boolean(data?.hasMore) };
};

export const useChatStore = create((set, get) => ({
  messages: [], selectedUser: null, isUserLoading: false, isMessageLoading: false,
  isLoadingOlder: false, hasMore: false, sending: false, loadToken: 0,
  chatList: [], requests: [], searchResults: [], activeTab: "chats", typing: false,
  messageSearch: "", messageMatchIds: [], messageSearchOpen: false, matchIndex: 0,
  editingMessage: null, replyingTo: null,
  getUsers: async () => {},
  getChats: async () => {
    try {
      const { data } = await axiosInstance.get("/messages/conversations");
      const me = useAuth.getState().authUser;
      const chats = await Promise.all(data.map(async (chat) => ({
        ...chat,
        lastPreview: await lastPreview(chat, me),
      })));
      set({ chatList: sortChats(chats) });
    } catch (error) { toast.error(error.response?.data?.message || "Failed to fetch chats."); }
  },
  getRequests: async () => {
    try { const { data } = await axiosInstance.get("/messages/requests"); set({ requests: data }); }
    catch (error) { toast.error(error.response?.data?.message || "Failed to fetch requests."); }
  },
  searchUsers: async (query) => {
    if (!query.trim()) return set({ searchResults: [] });
    try { const { data } = await axiosInstance.get("/messages/search", { params: { q: query } }); set({ searchResults: data }); }
    catch (error) { toast.error(error.response?.data?.message || "Search failed."); }
  },
  getMessages: async (userId) => {
    const token = get().loadToken + 1;
    set({ isMessageLoading: true, loadToken: token, hasMore: false });
    try {
      const { data } = await axiosInstance.get(`/messages/${userId}`, { params: { limit: 50 } });
      if (get().loadToken !== token || get().selectedUser?._id !== userId) return;
      const page = parseMessagePage(data);
      const peer = get().selectedUser;
      set({
        messages: await Promise.all(page.messages.map((message) => hydrate(message, peer))),
        hasMore: page.hasMore,
      });
      set((state) => ({
        chatList: state.chatList.map((chat) => idsEqual(chat.user?._id, userId) ? { ...chat, unreadCount: 0 } : chat),
      }));
    } catch (error) {
      if (get().loadToken !== token) return;
      toast.error(error.response?.data?.message || "Failed to load messages.");
    } finally {
      if (get().loadToken === token) set({ isMessageLoading: false });
    }
  },
  loadOlderMessages: async () => {
    const { selectedUser, messages, hasMore, isLoadingOlder } = get();
    if (!selectedUser || !hasMore || isLoadingOlder || !messages.length) return false;
    set({ isLoadingOlder: true });
    try {
      const { data } = await axiosInstance.get(`/messages/${selectedUser._id}`, {
        params: { limit: 50, before: messages[0]._id },
      });
      if (get().selectedUser?._id !== selectedUser._id) return false;
      const page = parseMessagePage(data);
      const older = await Promise.all(page.messages.map((message) => hydrate(message, selectedUser)));
      const existing = new Set(get().messages.map((message) => String(message._id)));
      set({
        messages: [...older.filter((message) => !existing.has(String(message._id))), ...get().messages],
        hasMore: page.hasMore,
        isLoadingOlder: false,
      });
      return older.length > 0;
    } catch {
      set({ isLoadingOlder: false });
      return false;
    }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages, replyingTo, sending } = get();
    const me = useAuth.getState().authUser;
    if (!selectedUser || sending) return;
    const tempId = `temp-${Date.now()}`;
    const pending = {
      _id: tempId,
      senderId: me._id,
      receiverId: selectedUser._id,
      displayText: messageData.text || "",
      image: messageData.image || "",
      createdAt: new Date().toISOString(),
      seen: false,
      pending: true,
      deleted: false,
      replyPreview: replyingTo ? { ...replyingTo, displayText: replyingTo.displayText } : null,
    };
    set({ messages: [...messages, pending], sending: true, replyingTo: null });
    try {
      const text = await encryptText(messageData.text || "", me, selectedUser);
      const { data } = await axiosInstance.post(`/messages/send/${selectedUser._id}`, {
        ...messageData,
        text,
        replyTo: replyingTo?._id || null,
      });
      const hydrated = await hydrate(data, selectedUser);
      set((state) => ({
        sending: false,
        messages: hasMessage(state.messages, hydrated._id)
          ? state.messages.filter((message) => message._id !== tempId)
          : state.messages.map((message) => message._id === tempId ? hydrated : message),
      }));
    } catch (error) {
      set((state) => ({ sending: false, messages: state.messages.filter((message) => message._id !== tempId) }));
      toast.error(error.response?.data?.message || "Failed to send message.");
    }
  },
  editMessage: async (messageId, text) => {
    const { selectedUser } = get();
    const previous = get().messages.find((message) => message._id === messageId);
    set((state) => ({
      editingMessage: null,
      messages: state.messages.map((message) => message._id === messageId ? { ...message, displayText: text, edited: true } : message),
    }));
    try {
      const encrypted = await encryptText(text, useAuth.getState().authUser, selectedUser);
      const { data } = await axiosInstance.patch(`/messages/${messageId}`, { text: encrypted });
      const updated = await hydrate(data, selectedUser);
      set((state) => ({
        messages: state.messages.map((message) => message._id === messageId ? { ...updated, replyPreview: message.replyPreview } : message),
      }));
    } catch (error) {
      if (previous) set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? previous : message) }));
      toast.error(error.response?.data?.message || "Could not edit message.");
    }
  },
  deleteMessage: async (messageId) => {
    const previous = get().messages.find((message) => message._id === messageId);
    set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? { ...message, deleted: true, displayText: "", image: "", replyPreview: null } : message) }));
    try {
      await axiosInstance.delete(`/messages/${messageId}`);
    } catch (error) {
      if (previous) set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? previous : message) }));
      toast.error(error.response?.data?.message || "Could not delete message.");
    }
  },
  searchMessages: async (query) => {
    set({ messageSearch: query, matchIndex: 0 });
    const localIds = get().messages.filter((message) => message.displayText?.toLowerCase().includes(query.toLowerCase())).map((message) => message._id);
    if (!query.trim() || !get().selectedUser) return set({ messageMatchIds: [] });
    try {
      const { data } = await axiosInstance.get(`/messages/conversation/${get().selectedUser._id}/search`, { params: { q: query } });
      set({ messageMatchIds: [...new Set([...localIds, ...data.map((message) => message._id)])] });
    } catch { set({ messageMatchIds: localIds }); }
  },
  goToMatch: (direction = 1) => {
    const ids = get().messageMatchIds;
    if (!ids.length) return;
    const next = (get().matchIndex + direction + ids.length) % ids.length;
    set({ matchIndex: next });
    document.getElementById(`msg-${ids[next]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  pruneExpired: () => set((state) => ({
    messages: state.messages.filter((message) => !message.expiresAt || new Date(message.expiresAt) > new Date()),
  })),
  respondToRequest: async (id, action) => {
    try {
      const { data } = await axiosInstance.put(`/messages/requests/${id}/${action}`);
      set((state) => ({ requests: state.requests.filter((request) => request._id !== id) }));
      if (action === "accept") { set({ activeTab: "chats" }); get().getChats(); }
      return data;
    } catch (error) { toast.error(error.response?.data?.message || "Could not update request."); }
  },
  subscribeToMessages: () => {
    const socket = useAuth.getState().socket;
    if (!socket) return;
    socket.off("newMessage").on("newMessage", async (message) => {
      const me = useAuth.getState().authUser;
      const selected = get().selectedUser;
      if (hasMessage(get().messages, message._id)) return;
      const mine = idsEqual(message.senderId, me?._id);
      const inView = selected && (idsEqual(message.senderId, selected._id) || (mine && idsEqual(message.receiverId, selected._id)));
      if (inView) {
        const pendingIndex = get().messages.findIndex((item) => item.pending && idsEqual(item.senderId, message.senderId));
        const hydrated = await hydrate(message, selected);
        set((state) => {
          if (hasMessage(state.messages, message._id)) return state;
          const next = [...state.messages];
          if (pendingIndex >= 0) next.splice(pendingIndex, 1, hydrated);
          else next.push(hydrated);
          return { messages: next };
        });
      } else if (!mine) {
        set((state) => ({
          chatList: sortChats(state.chatList.map((chat) => idsEqual(chat.user?._id, message.senderId)
            ? { ...chat, unreadCount: (chat.unreadCount || 0) + 1, updatedAt: message.createdAt, lastPreview: "New message" }
            : chat)),
        }));
        const chat = get().chatList.find((item) => idsEqual(item.user?._id, message.senderId));
        if (!chat?.muted) notifyIncomingMessage({ title: "New message", body: "You have a new message", tag: String(message._id) });
      }
    });
    socket.off("messagesSeen").on("messagesSeen", ({ messageIds }) => set((state) => ({ messages: state.messages.map((message) => messageIds.includes(String(message._id)) || messageIds.includes(message._id) ? { ...message, seen: true } : message) })));
    socket.off("messageEdited").on("messageEdited", async (message) => {
      if (!get().messages.some((item) => idsEqual(item._id, message._id))) return;
      const updated = await hydrate(message, get().selectedUser);
      set((state) => ({ messages: state.messages.map((item) => idsEqual(item._id, message._id) ? { ...updated, replyPreview: item.replyPreview } : item) }));
    });
    socket.off("messageDeleted").on("messageDeleted", ({ _id }) => set((state) => ({ messages: state.messages.map((message) => idsEqual(message._id, _id) ? { ...message, deleted: true, text: "", image: "", displayText: "", replyPreview: null } : message) })));
    socket.off("typing").on("typing", ({ from }) => { if (idsEqual(from, get().selectedUser?._id)) set({ typing: true }); });
    socket.off("stopTyping").on("stopTyping", ({ from }) => { if (idsEqual(from, get().selectedUser?._id)) set({ typing: false }); });
    socket.off("conversationRequest").on("conversationRequest", (request) => {
      const myId = useAuth.getState().authUser?._id;
      const user = request.participants?.find((participant) => !idsEqual(participant._id, myId));
      if (!user) return;
      set((state) => ({ requests: [{ ...request, user }, ...state.requests.filter((item) => item._id !== request._id)] }));
      toast("New conversation request");
    });
    socket.off("conversationUpdated").on("conversationUpdated", (conversation) => {
      set((state) => ({ requests: state.requests.filter((request) => request._id !== conversation._id) }));
      if (conversation.status === "accepted") get().getChats();
    });
    socket.off("conversationMoodUpdated").on("conversationMoodUpdated", (payload) => {
      useConversationThemeStore.getState().setMoodFromSocket(payload);
    });
  },
  unsubscribeFromMessages: () => ["newMessage", "messagesSeen", "messageEdited", "messageDeleted", "typing", "stopTyping", "conversationRequest", "conversationUpdated", "conversationMoodUpdated"].forEach((event) => useAuth.getState().socket?.off(event)),
  setSelectedUser: (selectedUser) => set({
    selectedUser,
    messages: [],
    typing: false,
    messageSearch: "",
    messageMatchIds: [],
    messageSearchOpen: false,
    editingMessage: null,
    replyingTo: null,
    hasMore: false,
    matchIndex: 0,
  }),
  setActiveTab: (activeTab) => set({ activeTab, searchResults: [] }),
  setChatList: (chatList) => set({ chatList: sortChats(chatList) }),
  setMessageSearchOpen: (messageSearchOpen) => set({ messageSearchOpen, ...(messageSearchOpen ? {} : { messageSearch: "", messageMatchIds: [] }) }),
  setEditingMessage: (editingMessage) => set({ editingMessage, replyingTo: null }),
  setReplyingTo: (replyingTo) => set({ replyingTo, editingMessage: null }),
}));
