import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";

const emptyMoodState = {
  conversationId: null,
  selectedPeerId: null,
  mine: null,
  theirs: null,
  muted: false,
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
    set({
      mine: { mood, updatedAt: new Date().toISOString() },
      isMoodSaving: true,
      isPickerOpen: false,
    });
    try {
      const { data } = await axiosInstance.put(`/messages/conversation/${userId}/mood`, { mood });
      if (get().selectedPeerId !== userId) return;
      set({
        mine: data.mine,
        theirs: data.theirs,
        conversationId: data.conversationId,
        muted: Boolean(data.muted),
        isMoodSaving: false,
      });
    } catch (error) {
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
    const { selectedPeerId, conversationId } = get();
    const sameConversation = conversationId && payload.conversationId && String(payload.conversationId) === String(conversationId);
    const samePeer = selectedPeerId && String(payload.userId) === String(selectedPeerId);
    if (!samePeer && !sameConversation) return;
    set({
      theirs: { mood: payload.mood, updatedAt: payload.updatedAt },
      conversationId: payload.conversationId || conversationId,
    });
  },
}));
