import { create } from "zustand";
import { axiosInstance } from "../lib/axios.jsx";
import toast from "react-hot-toast";
import { data } from "react-router-dom";


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
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            set({ authUser: res.data });
            toast.success("Logged in successfully");
        } catch (error) {
            toast.error(error.response.data.message, "Login failed");
        } finally {
            set({ isLoggingIn: false });
        }
    },

    updateProfile: async(data)=>{
        set({
            isUpdatingProfile: true
        })
        try {
            const res = await axiosInstance.put("/auth/update-profile",data)
            set({
                authUser:res.data
            })
            toast.success("profile updated successfully")
        } catch (error) {
            console.log("error in update profile: ", error)
            toast.error(error.response.data.message)
            
        }finally{
            set({isUpdatingProfile: false})
        }

    },

    }))