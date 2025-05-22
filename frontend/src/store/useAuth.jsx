import { create } from "zustand";
import { axiosInstance } from "../lib/axios.jsx";
import toast from "react-hot-toast";
import { data } from "react-router-dom";
// import { socket } from "../lib/socket";
import {io} from "socket.io-client";

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

export const useAuth = create((set, get) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatindProfile: false,
    isCheckingAuth: true,
    onlineUsers: [],
    socket: null,

    checkAuth: async () => {
        try {
            const res = await axiosInstance.get("/auth/check")

            set({ authUser: res.data })
            get().connectSocket()

        } catch (error) {
            set({ authUser: null })
        } finally {
            set({ isCheckingAuth: false })
        }
    },

    isSignup: async (data) => {
        set({ isSigningUp: true });
        try {
            const res = await axiosInstance.post("/auth/signup", data)
            set({
                authUser: res.data,
            })
            toast.success("account created successfully")
            get().connectSocket()

        } catch (error) {
            toast.error(error.response.data.message)
            console.log("error in signup");

        }
        finally {
            set({
                isSigningUp: false
            })
        }
    },

    isLogout: async () => {
        try {
            await axiosInstance.post("/auth/logout")
            set({ authUser: null })
            toast.success("logged out successfully")
            get().disconnectSocket()
        } catch (error) {
            toast.error(error.response.data.message)
            console.error("Logout failed:", error);
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            set({ authUser: res.data });
            toast.success("Logged in successfully");

            get().connectSocket();

        } catch (error) {
            toast.error(error.response.data.message, "Login failed");
        } finally {
            set({ isLoggingIn: false });
        }
    },

    updateProfile: async (data) => {
        set({
            isUpdatingProfile: true
        })
        try {
            const res = await axiosInstance.put("/auth/update-profile", data)
            set({
                authUser: res.data
            })
            toast.success("profile updated successfully")
        } catch (error) {
            console.log("error in update profile: ", error)
            toast.error(error.response.data.message)

        } finally {
            set({ isUpdatingProfile: false })
        }
    },

    connectSocket: () => {
        const { authUser } = get();
      
        if (!authUser || get().socket?.connected) return;
      
        const socket = io(BASE_URL, {
          query: {
            userId: authUser._id,
          },
        });
      
        socket.connect();
      
        set({ socket });
      
        socket.on("getOnlineUsers", (userIds) => {
          set({ onlineUsers: userIds });
        });
      
        socket.on("newMessage", (message) => {
          console.log("New message received:", message);
            const { currentChat } = get().message || [];
            set({messages: [...currentChat, message] });
           
        });
      },
      
    disconnectSocket: () => {
        if (get().socket?.connected) {
            get().socket.disconnect()
            console.log("disconnected from socket server")

        }
    },
}))