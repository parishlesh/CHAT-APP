import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";



export const useChatStore = create((set, get) => ({
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


    getMessages: async (userId) => { 
        set({ isMessageLoading: true });
        try {
            const res = await axiosInstance.get(`/messages/${userId}`);
            set({ messages: res.data });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to fetch messages.");
        } finally {
            set({ isMessageLoading: false });
        }
    },

    sendMessage: async(messageData)=>{
        const {selectedUser, messages}= get()
        try {
            console.log("Sending message to:", selectedUser._id);
            console.log("Message data size:", JSON.stringify(messageData).length);
            
            const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData)
            set({messages:[...messages, res.data]})
        } catch (error) {
            toast.error(error.response.data.message)
        }
    },

    // Set selected user //optimization later
    setSelectedUser: (selectedUser) => {
        set({ selectedUser: selectedUser });
    },
}));
