import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { decryptText, encryptText } from "../lib/encryption";
import { useAuth } from "./useAuth";

const sortChats = (items) => [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
const hydrate = async (message, peer) => {
  const me = useAuth.getState().authUser;
  return { ...message, displayText: message.deleted ? "" : await decryptText(message.text, me, peer) };
};

export const useChatStore = create((set, get) => ({
  messages: [], selectedUser: null, isUserLoading: false, isMessageLoading: false,
  chatList: [], requests: [], searchResults: [], activeTab: "chats", typing: false,
  messageSearch: "", messageMatchIds: [],
  getUsers: async () => {},
  getChats: async () => {
    try { const { data } = await axiosInstance.get("/messages/conversations"); set({ chatList: sortChats(data) }); }
    catch (error) { toast.error(error.response?.data?.message || "Failed to fetch chats."); }
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
    set({ isMessageLoading: true });
    try {
      const { data } = await axiosInstance.get(`/messages/${userId}`);
      const peer = get().selectedUser;
      set({ messages: await Promise.all(data.map((message) => hydrate(message, peer))) });
    } catch (error) { toast.error(error.response?.data?.message || "Failed to fetch messages."); }
    finally { set({ isMessageLoading: false }); }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get(); const me = useAuth.getState().authUser;
    if (!selectedUser) return;
    try {
      const text = await encryptText(messageData.text || "", me, selectedUser);
      const { data } = await axiosInstance.post(`/messages/send/${selectedUser._id}`, { ...messageData, text });
      set({ messages: [...messages, await hydrate(data, selectedUser)] });
      get().getChats();
    } catch (error) { toast.error(error.response?.data?.message || "Failed to send message."); }
  },
  editMessage: async (messageId, text) => {
    const { selectedUser } = get();
    try {
      const encrypted = await encryptText(text, useAuth.getState().authUser, selectedUser);
      const { data } = await axiosInstance.patch(`/messages/${messageId}`, { text: encrypted });
      const updated = await hydrate(data, selectedUser);
      set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? updated : message) }));
    } catch (error) { toast.error(error.response?.data?.message || "Could not edit message."); }
  },
  deleteMessage: async (messageId) => {
    try {
      const { data } = await axiosInstance.delete(`/messages/${messageId}`);
      set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? { ...data, displayText: "" } : message) }));
    } catch (error) { toast.error(error.response?.data?.message || "Could not delete message."); }
  },
  searchMessages: async (query) => {
    set({ messageSearch: query });
    const localIds = get().messages.filter((message) => message.displayText?.toLowerCase().includes(query.toLowerCase())).map((message) => message._id);
    if (!query.trim() || !get().selectedUser) return set({ messageMatchIds: [] });
    try {
      const { data } = await axiosInstance.get(`/messages/conversation/${get().selectedUser._id}/search`, { params: { q: query } });
      set({ messageMatchIds: [...new Set([...localIds, ...data.map((message) => message._id)])] });
    } catch { set({ messageMatchIds: localIds }); }
  },
  // MongoDB TTL deletion is asynchronous (normally checked about once a minute), so
  // this client poll hides locally expired messages before the database removes them.
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
      if (message.senderId === get().selectedUser?._id) set({ messages: [...get().messages, await hydrate(message, get().selectedUser)] });
      get().getChats();
    });
    socket.off("messagesSeen").on("messagesSeen", ({ messageIds }) => set((state) => ({ messages: state.messages.map((message) => messageIds.includes(message._id) ? { ...message, seen: true } : message) })));
    socket.off("messageEdited").on("messageEdited", async (message) => {
      if (message.senderId !== get().selectedUser?._id) return;
      const updated = await hydrate(message, get().selectedUser);
      set((state) => ({ messages: state.messages.map((item) => item._id === message._id ? updated : item) }));
    });
    socket.off("messageDeleted").on("messageDeleted", ({ _id }) => set((state) => ({ messages: state.messages.map((message) => message._id === _id ? { ...message, deleted: true, text: "", image: "", displayText: "" } : message) })));
    socket.off("typing").on("typing", ({ from }) => { if (from === get().selectedUser?._id) set({ typing: true }); });
    socket.off("stopTyping").on("stopTyping", ({ from }) => { if (from === get().selectedUser?._id) set({ typing: false }); });
    socket.off("conversationRequest").on("conversationRequest", (request) => {
      const myId = useAuth.getState().authUser?._id;
      const user = request.participants?.find((participant) => participant._id !== myId);
      if (!user) return;
      set((state) => ({ requests: [{ ...request, user }, ...state.requests.filter((item) => item._id !== request._id)] }));
      toast("New conversation request");
    });
    socket.off("conversationUpdated").on("conversationUpdated", (conversation) => {
      set((state) => ({ requests: state.requests.filter((request) => request._id !== conversation._id) }));
      if (conversation.status === "accepted") get().getChats();
    });
  },
  unsubscribeFromMessages: () => ["newMessage", "messagesSeen", "messageEdited", "messageDeleted", "typing", "stopTyping", "conversationRequest", "conversationUpdated"].forEach((event) => useAuth.getState().socket?.off(event)),
  setSelectedUser: (selectedUser) => set({ selectedUser, messages: [], typing: false, messageSearch: "", messageMatchIds: [] }),
  setActiveTab: (activeTab) => set({ activeTab, searchResults: [] }),
  setChatList: (chatList) => set({ chatList: sortChats(chatList) }),
}));
