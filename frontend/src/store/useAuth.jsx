import { create } from "zustand";
import { axiosInstance } from "../lib/axios.jsx";


export const useAuth = create((set)=>({
authUser: null,
isSigningUp: false,
isLoggingIn: false,
isUpdatindProfile: false,

isCheckingAuth: true,

checkAuth: async ()=>{
    try {
        const res = await axiosInstance.get("/auth/check")

        set({authUser: res.data})

    } catch (error) {
        set({authUser: null})
    } finally{
        set({isCheckingAuth:false})
    }
}

}))