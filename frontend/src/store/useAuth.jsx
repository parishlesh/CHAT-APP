import { create } from "zustand";
import { axiosInstance } from "../lib/axios.jsx";
import toast from "react-hot-toast";
// import { socket } from "../lib/socket";
import {io} from "socket.io-client";
import {
    ensureEncryptionKey,
    setSessionWrapPassword,
    clearSessionWrapPassword,
    isEncryptionReady,
    isEncryptionInitialized,
    getEncryptionFailure,
    hasUnlockSecret,
    resetUnrecoverableEncryptionIdentity,
    preparePasswordChangeBackup,
} from "../lib/encryption";

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

const encryptionState = (extra = {}) => ({
    encryptionReady: isEncryptionReady(),
    encryptionInitialized: isEncryptionInitialized(),
    encryptionFailure: getEncryptionFailure(),
    canResetEncryption: getEncryptionFailure() === "KEY_BACKUP_REQUIRED" && hasUnlockSecret(),
    ...extra,
});

export const useAuth = create((set, get) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatingProfile: false,
    isCheckingAuth: true,
    isResettingEncryption: false,
    authEpoch: 0,
    onlineUsers: [],
    socket: null,
    encryptionReady: false,
    encryptionInitialized: false,
    encryptionFailure: null,
    canResetEncryption: false,

    checkAuth: async () => {
        const epoch = get().authEpoch;
        try {
            const res = await axiosInstance.get("/auth/check")
            if (get().authEpoch !== epoch) return;

            const user = await ensureEncryptionKey(res.data, axiosInstance);
            if (get().authEpoch !== epoch) return;
            set({ authUser: user, ...encryptionState() })
            get().connectSocket()
            import("./useChatStore").then(({ useChatStore }) => {
              useChatStore.getState().retryPendingDecryption();
            });

        } catch (error) {
            if (get().authEpoch !== epoch) return;
            clearSessionWrapPassword();
            set({ authUser: null, ...encryptionState({ encryptionReady: false, encryptionInitialized: false, encryptionFailure: null, canResetEncryption: false }) })
            await clearAccountStores();
        } finally {
            if (get().authEpoch === epoch) set({ isCheckingAuth: false })
        }
    },

    isSignup: async (data) => {
        set({ isSigningUp: true, authEpoch: get().authEpoch + 1 });
        try {
            const res = await axiosInstance.post("/auth/signup", data)
            setSessionWrapPassword(data.password);
            const user = await ensureEncryptionKey(res.data, axiosInstance, data.password);
            await clearAccountStores();
            set({ authUser: user, ...encryptionState() })
            toast.success("Account created")
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
            clearSessionWrapPassword();
            await clearAccountStores();
            get().disconnectSocket()
            set({ authUser: null, ...encryptionState({ encryptionReady: false, encryptionInitialized: false, encryptionFailure: null, canResetEncryption: false }) })
            toast.success("logged out successfully")
        } catch (error) {
            toast.error(error.response?.data?.message || "Logout failed.")
            console.error("Logout failed:", error);
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true, authEpoch: get().authEpoch + 1 });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            setSessionWrapPassword(data.password);
            const user = await ensureEncryptionKey(res.data, axiosInstance, data.password);
            await clearAccountStores();
            set({ authUser: user, ...encryptionState() });
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
                authUser: user,
                ...encryptionState(),
            })
            toast.success("profile updated successfully")
        } catch (error) {
            console.log("error in update profile: ", error)
            toast.error(error.response?.data?.message || "Failed to update profile.")

        } finally {
            set({ isUpdatingProfile: false })
        }
    },

    requestPasswordOtp: async ({ purpose, identifier } = {}) => {
        const body = purpose === "PASSWORD_CHANGE"
            ? { purpose: "PASSWORD_CHANGE" }
            : { purpose: "PASSWORD_RESET", identifier };
        const { data } = await axiosInstance.post("/auth/password/otp/request", body);
        return data;
    },

    verifyPasswordOtp: async ({ purpose, identifier, otp } = {}) => {
        const body = purpose === "PASSWORD_CHANGE"
            ? { purpose: "PASSWORD_CHANGE", otp }
            : { purpose: "PASSWORD_RESET", identifier, otp };
        const { data } = await axiosInstance.post("/auth/password/otp/verify", body);
        return data;
    },

    commitPasswordChange: async ({ resetToken, newPassword, userHint } = {}) => {
        const wrapped = await preparePasswordChangeBackup(userHint || get().authUser, newPassword);
        const body = { resetToken, newPassword };
        if (wrapped.available) {
            body.encryptionPublicKey = wrapped.encryptionPublicKey;
            body.encryptionKeyBackup = wrapped.encryptionKeyBackup;
        }
        const { data } = await axiosInstance.post("/auth/password/change", body);
        get().disconnectSocket();
        clearSessionWrapPassword();
        await clearAccountStores();
        set({
            authEpoch: get().authEpoch + 1,
            authUser: null,
            ...encryptionState({
                encryptionReady: false,
                encryptionInitialized: false,
                encryptionFailure: null,
                canResetEncryption: false,
            }),
        });
        return { ...data, encryptionBackupPrepared: wrapped.available };
    },

    resetUnrecoverableEncryption: async () => {
        const { authUser } = get();
        if (!authUser || get().isResettingEncryption) return;
        set({ isResettingEncryption: true });
        try {
            const user = await resetUnrecoverableEncryptionIdentity(authUser, axiosInstance);
            set({ authUser: user, ...encryptionState() });
            toast.success("New encryption keys created on this device.");
            import("./useChatStore").then(({ useChatStore }) => {
                const chat = useChatStore.getState();
                chat.retryPendingDecryption();
                if (chat.selectedUser?._id) chat.getMessages(chat.selectedUser._id);
            });
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || "Could not create new encryption keys.");
        } finally {
            set({ isResettingEncryption: false });
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
