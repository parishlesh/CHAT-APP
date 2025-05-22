import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { useAuth } from "./useAuth";



export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    selectedUser: null,
    isUserLoading: false, 
    isMessageLoading: false,
    chatList: [],


    getUsers: async () => {
        set({ isUserLoading: true });
        try {
            const res = await axiosInstance.get("/messages/users");
            set({ users: res.data }); 
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


    subscribeToMessages: () => {
        const {selectedUser} = get()

        if(!selectedUser) {
            console.error("No selected user to subscribe to messages.");
            return;
        }

        const socket = useAuth.getState().socket;

        socket.on("newMessage", (newMessage) => {
            const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
            if(!isMessageSentFromSelectedUser) return;

           set({
            messages: [...get().messages, newMessage]
        })
        });
    },

    unsubscribeFromMessages: () => {
        const socket = useAuth.getState().socket;

        socket.off("newMessage")
    },


    setSelectedUser: (selectedUser) => {
        set({ selectedUser: selectedUser });
    },


    setChatList: (chatList) => {
        const sortedChats = chatList.sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
          );
          set({ chatList: sortedChats });
    },
}));
