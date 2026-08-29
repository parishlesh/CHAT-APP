import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { useAuth } from "./useAuth";

const emptyMoodState = {
  conversationId: null,
  selectedPeerId: null,
  mine: null,
  theirs: null,
  muted: false,
  theirAvailability: null,
  isMoodLoading: false,
  isMoodSaving: false,
  isPickerOpen: false,
};

export const useConversationThemeStore = create((set, get) => ({
  ...emptyMoodState,

  clearConversationMood: () => set({ ...emptyMoodState }),

  openMoodPicker: () => set({ isPickerOpen: true }),
  closeMoodPicker: () => set({ isPickerOpen: false }),

  getConversationMood: async (userId) => {
    set({
      conversationId: null,
      selectedPeerId: userId,
      mine: null,
      theirs: null,
      isMoodLoading: true,
      isPickerOpen: false,
    });
    try {
      const { data } = await axiosInstance.get(`/messages/conversation/${userId}/mood`);
      if (get().selectedPeerId !== userId) return;
      set({
        conversationId: data.conversationId,
        mine: data.mine,
        theirs: data.theirs,
        muted: Boolean(data.muted),
        theirAvailability: data.theirAvailability || null,
        isMoodLoading: false,
      });
    } catch (error) {
      if (get().selectedPeerId !== userId) return;
      set({ isMoodLoading: false, mine: null, theirs: null, conversationId: null });
      toast.error(error.response?.data?.message || "Could not load conversation mood.");
    }
  },

  setConversationMood: async (userId, mood) => {
    const previous = get().mine;
    const previousAuth = useAuth.getState().authUser;
    set({
      mine: { mood, updatedAt: new Date().toISOString() },
      isMoodSaving: true,
      isPickerOpen: false,
    });
    if (previousAuth) useAuth.setState({ authUser: { ...previousAuth, mood } });
    try {
      const { data } = await axiosInstance.put(`/messages/conversation/${userId}/mood`, { mood });
      const nextMood = data.mine?.mood || mood;
      const authUser = useAuth.getState().authUser;
      if (authUser) useAuth.setState({ authUser: { ...authUser, mood: nextMood, moodUpdatedAt: data.mine?.updatedAt } });
      if (get().selectedPeerId !== userId) {
        set({ isMoodSaving: false });
        return;
      }
      set({
        mine: data.mine,
        theirs: data.theirs,
        conversationId: data.conversationId,
        muted: Boolean(data.muted),
        theirAvailability: data.theirAvailability || get().theirAvailability,
        isMoodSaving: false,
      });
    } catch (error) {
      if (previousAuth) useAuth.setState({ authUser: previousAuth });
      if (get().selectedPeerId === userId) {
        set({ mine: previous, isMoodSaving: false });
      }
      toast.error(error.response?.data?.message || "Could not update mood.");
    }
  },

  setConversationMute: async (userId, muted) => {
    const previous = get().muted;
    set({ muted });
    try {
      const { data } = await axiosInstance.put(`/messages/conversation/${userId}/mute`, { muted });
      if (get().selectedPeerId !== userId) return;
      set({ muted: Boolean(data.muted) });
    } catch (error) {
      if (get().selectedPeerId === userId) set({ muted: previous });
      toast.error(error.response?.data?.message || "Could not update mute.");
    }
  },

  setMoodFromSocket: (payload) => {
    if (!payload?.userId) return;
    const { selectedPeerId } = get();
    if (!selectedPeerId || String(payload.userId) !== String(selectedPeerId)) return;
    set({
      theirs: { mood: payload.mood, updatedAt: payload.updatedAt },
    });
  },
}));
