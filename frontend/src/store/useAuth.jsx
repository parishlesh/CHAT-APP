import { create } from "zustand";
import { axiosInstance } from "../lib/axios.jsx";
import toast from "react-hot-toast";


export const useAuth = create((set) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatindProfile: false,

    isCheckingAuth: true,

    checkAuth: async () => {
        try {
            const res = await axiosInstance.get("/auth/check")

            set({ authUser: res.data })

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
          set({authUser: null })
          toast.success("logged out successfully")
        } catch (error) {
            toast.error(error.response.data.message)
            console.error("Logout failed:", error);
        }
    }
    }))