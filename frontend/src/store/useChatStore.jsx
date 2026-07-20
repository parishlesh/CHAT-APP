import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { useAuth } from "./useAuth";

const sortChats = (items) => [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

export const useChatStore = create((set, get) => ({
  messages: [], selectedUser: null, isUserLoading: false, isMessageLoading: false,
  chatList: [], requests: [], searchResults: [], activeTab: "chats",
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
    try { const { data } = await axiosInstance.get(`/messages/${userId}`); set({ messages: data }); }
    catch (error) { toast.error(error.response?.data?.message || "Failed to fetch messages."); }
    finally { set({ isMessageLoading: false }); }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    if (!selectedUser) return;
    try {
      const { data } = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      set({ messages: [...messages, data] });
      get().getChats();
    } catch (error) { toast.error(error.response?.data?.message || "Failed to send message."); }
  },
  respondToRequest: async (id, action) => {
    try {
      const { data } = await axiosInstance.put(`/messages/requests/${id}/${action}`);
      set((state) => ({ requests: state.requests.filter((request) => request._id !== id) }));
      if (action === "accept") {
        set({ activeTab: "chats" });
        get().getChats();
      }
      return data;
    } catch (error) { toast.error(error.response?.data?.message || "Could not update request."); }
  },
  subscribeToMessages: () => {
    const socket = useAuth.getState().socket;
    if (!socket) return;
    socket.off("newMessage").on("newMessage", (message) => {
      if (message.senderId === get().selectedUser?._id) set({ messages: [...get().messages, message] });
      get().getChats();
    });
    socket.off("conversationRequest").on("conversationRequest", (request) => {
      const myId = useAuth.getState().authUser?._id;
      const user = request.participants?.find((participant) => participant._id !== myId);
      if (!user) return;
      set((state) => ({
        requests: [{ ...request, user }, ...state.requests.filter((item) => item._id !== request._id)],
      }));
      toast("New conversation request");
    });
    socket.off("conversationUpdated").on("conversationUpdated", (conversation) => {
      set((state) => ({ requests: state.requests.filter((request) => request._id !== conversation._id) }));
      if (conversation.status === "accepted") get().getChats();
    });
  },
  unsubscribeFromMessages: () => {
    const socket = useAuth.getState().socket;
    socket?.off("newMessage");
    socket?.off("conversationRequest");
    socket?.off("conversationUpdated");
  },
  setSelectedUser: (selectedUser) => set({ selectedUser, messages: [] }),
  setActiveTab: (activeTab) => set({ activeTab, searchResults: [] }),
  setChatList: (chatList) => set({ chatList: sortChats(chatList) }),
}));
