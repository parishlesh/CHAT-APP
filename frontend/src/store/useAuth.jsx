import { create } from "zustand";
import { axiosInstance } from "../lib/axios.jsx";
import toast from "react-hot-toast";
// import { socket } from "../lib/socket";
import {io} from "socket.io-client";
import { ensureEncryptionKey } from "../lib/encryption";

const BASE_URL =
    import.meta.env.MODE === "development"
        ? "http://localhost:5001"
        : window.location.origin;
        
const clearAccountStores = async () => {
  const [{ useChatStore }, { useConversationThemeStore }] = await Promise.all([
    import("./useChatStore"),
    import("./useConversationThemeStore"),
  ]);
  useChatStore.getState().resetChatState();
  useConversationThemeStore.getState().clearConversationMood();
};

export const useAuth = create((set, get) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatingProfile: false,
    isCheckingAuth: true,
    onlineUsers: [],
    socket: null,

    checkAuth: async () => {
        try {
            const res = await axiosInstance.get("/auth/check")

            const user = await ensureEncryptionKey(res.data, axiosInstance);
            set({ authUser: user })
            get().connectSocket()
            import("./useChatStore").then(({ useChatStore }) => {
              useChatStore.getState().retryPendingDecryption({ includeFailed: true });
            });

        } catch (error) {
            set({ authUser: null })
            await clearAccountStores();
        } finally {
            set({ isCheckingAuth: false })
        }
    },

    isSignup: async (data) => {
        set({ isSigningUp: true });
        try {
            const res = await axiosInstance.post("/auth/signup", data)
            const user = await ensureEncryptionKey(res.data, axiosInstance, data.password);
            await clearAccountStores();
            set({ authUser: user })
            toast.success("account created successfully")
            get().connectSocket()

        } catch (error) {
            toast.error(error.response?.data?.message || "Signup failed.")
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
            await clearAccountStores();
            get().disconnectSocket()
            set({ authUser: null })
            toast.success("logged out successfully")
        } catch (error) {
            toast.error(error.response?.data?.message || "Logout failed.")
            console.error("Logout failed:", error);
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            const user = await ensureEncryptionKey(res.data, axiosInstance, data.password);
            await clearAccountStores();
            set({ authUser: user });
            toast.success("Logged in successfully");

            get().connectSocket();

        } catch (error) {
            toast.error(error.response?.data?.message || "Login failed.");
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
            const user = await ensureEncryptionKey(res.data, axiosInstance);
            set({
                authUser: user
            })
            toast.success("profile updated successfully")
        } catch (error) {
            console.log("error in update profile: ", error)
            toast.error(error.response?.data?.message || "Failed to update profile.")

        } finally {
            set({ isUpdatingProfile: false })
        }
    },

    connectSocket: () => {
        const { authUser } = get();
        if (!authUser) return;
        const existing = get().socket;
        if (existing?.connected) return;
        if (existing) {
          existing.removeAllListeners();
          existing.disconnect();
          set({ socket: null });
        }

        const socket = io(BASE_URL, {
          path: "/socket.io",
          withCredentials: true,
          transports: ["polling", "websocket"],
          upgrade: true,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          query: {
            userId: authUser._id,
          },
        });

        socket.on("getOnlineUsers", (userIds) => {
          set({ onlineUsers: userIds });
        });
        socket.on("connect", () => {
          if (import.meta.env.DEV) {
            console.info("[socket]", { connected: true, id: socket.id, userId: String(authUser._id) });
          }
          import("./useChatStore").then(({ useChatStore }) => {
            const chat = useChatStore.getState();
            chat.subscribeToMessages();
            chat.getChats();
            chat.getRequests();
            if (chat.selectedUser?._id) chat.getMessages(chat.selectedUser._id);
          });
        });
        socket.on("disconnect", (reason) => {
          if (import.meta.env.DEV) console.info("[socket]", { connected: false, reason });
        });
        socket.on("connect_error", (error) => {
          if (import.meta.env.DEV) console.warn("[socket] connect_error", error?.message || "failed");
        });

        set({ socket });
      },

    disconnectSocket: () => {
        const socket = get().socket;
        if (socket) {
            socket.removeAllListeners();
            socket.disconnect();
            set({ socket: null, onlineUsers: [] });
        }
    },
}))
