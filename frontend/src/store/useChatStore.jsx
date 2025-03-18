import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";

export const useChatStore = create((set) => ({
    messages: [],
    users: [],
    selectedUser: null,
    isUserLoading: false, 
    isMessageLoading: false,

    // Fetch all users
    getUsers: async () => {
        set({ isUserLoading: true });
        try {
            const res = await axiosInstance.get("/messages/users");
            set({ users: res.data }); // ✅ Fixed key (was 'user', now 'users')
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to fetch users.");
        } finally {
            set({ isUserLoading: false });
        }
    },

    // Fetch messages for a selected user
    getMessage: async (userId) => {
        set({ isMessageLoading: true });
        try {
            const res = await axiosInstance.get(`/message/${userId}`);
            set({ messages: res.data });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to fetch messages.");
        } finally {
            set({ isMessageLoading: false });
        }
    },

    // Set selected user //optimization later
    setSelectedUser: (selectedUser) => {
        set({ selectedUser: selectedUser });
    },
}));
