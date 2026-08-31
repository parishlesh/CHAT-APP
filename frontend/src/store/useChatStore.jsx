import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { decryptMessage, encryptText, isEncryptedText, resolveConversationPeerKey, toPublicJwk, waitForEncryptionInit } from "../lib/encryption";
import { notifyIncomingMessage } from "../lib/notify";
import { getVibeMeta } from "../config/conversationVibes";
import { useAuth } from "./useAuth";
import { useConversationThemeStore } from "./useConversationThemeStore";

const sortChats = (items) => [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
const idsEqual = (a, b) => String(a) === String(b);
const conversationIdForUser = (state, userId) => {
  if (!userId) return null;
  return state.chatList.find((chat) => String(chat.user?._id) === String(userId))?._id
    || state.requests.find((request) => String(request.user?._id) === String(userId))?._id
    || null;
};
const hasMessage = (messages, id) => messages.some((message) => idsEqual(message._id, id));

const hydrate = async (message, peer) => {
  await waitForEncryptionInit();
  const me = useAuth.getState().authUser;
  if (message.kind === "system" || message.systemEvent) {
    return {
      ...message,
      displayText: message.text || "This user has rejected your conversation request.",
      decryptStatus: "decrypted",
      replyPreview: null,
      pending: false,
    };
  }
  const listed = useChatStore.getState().chatList.find((chat) => idsEqual(chat.user?._id, peer?._id))?.user
    || useChatStore.getState().requests.find((request) => idsEqual(request.user?._id, peer?._id))?.user;
  const peerPublicKey = resolveConversationPeerKey(me, peer, listed);
  const other = { encryptionPublicKey: peerPublicKey, peerResolved: Boolean(peer || listed) };
  if (message.deleted) {
    return { ...message, displayText: "", decryptStatus: "decrypted", replyPreview: null, pending: false };
  }
  const result = await decryptMessage(message.text, me, other);
  let replyPreview = null;
  if (message.replyTo && typeof message.replyTo === "object" && message.replyTo._id) {
    const replyResult = message.replyTo.deleted
      ? { status: "decrypted", text: "" }
      : await decryptMessage(message.replyTo.text, me, other);
    replyPreview = {
      ...message.replyTo,
      displayText: isEncryptedText(replyResult.text) ? "" : replyResult.text,
      decryptStatus: isEncryptedText(replyResult.text) ? "pending" : replyResult.status,
    };
  }
  return {
    ...message,
    displayText: result.status === "pending" || isEncryptedText(result.text)
      ? ""
      : result.text,
    decryptStatus: isEncryptedText(result.text) && result.status !== "failed" ? "pending" : result.status,
    replyPreview,
    pending: false,
  };
};

const lastPreview = async (chat, me) => {
  const last = chat.lastMessage;
  if (!last) return "";
  if (last.deleted) return "This message was deleted";
  if (last.kind === "system" || last.systemEvent) return last.text || "This user has rejected your conversation request.";
  if (last.image && !last.text) return "Photo";
  const result = await decryptMessage(last.text, me, chat.user);
  if (result.status !== "decrypted" || isEncryptedText(result.text)) return last.image ? "Photo" : "Message";
  if (last.image) return result.text ? result.text : "Photo";
  return result.text;
};

const asPendingMessage = (message) => {
  if (message.kind === "system" || message.systemEvent) {
    return {
      ...message,
      displayText: message.text || "This user has rejected your conversation request.",
      decryptStatus: "decrypted",
      pending: false,
    };
  }
  if (message.deleted) return { ...message, displayText: "", decryptStatus: "decrypted", pending: false };
  if (!isEncryptedText(message.text)) {
    return { ...message, displayText: message.text || "", decryptStatus: "decrypted", pending: false };
  }
  return { ...message, displayText: "", decryptStatus: "pending", pending: false };
};

const composerAllowed = (state) => {
  const me = useAuth.getState().authUser?._id;
  const { conversationStatus, conversationInitiatedBy } = state;
  if (!conversationStatus || conversationStatus === "accepted") return true;
  return idsEqual(conversationInitiatedBy, me);
};

const participantNotMe = (conversation, myId) =>
  (conversation?.participants || []).find((participant) => !idsEqual(participant._id, myId))
  || conversation?.user;

const preferExistingPlaintext = (previous, hydrated) => {
  if (hydrated.decryptStatus === "decrypted") return hydrated;
  if (previous?.decryptStatus === "decrypted" && previous.displayText && !isEncryptedText(previous.displayText)) {
    return { ...hydrated, displayText: previous.displayText, decryptStatus: "decrypted" };
  }
  return hydrated;
};

const parseMessagePage = (data) => {
  if (Array.isArray(data)) return { messages: data, hasMore: false };
  return { messages: data?.messages || [], hasMore: Boolean(data?.hasMore) };
};

const chatSessionState = {
  messages: [], selectedUser: null, isUserLoading: false, isMessageLoading: false,
  isLoadingOlder: false, hasMore: false, sending: false,
  chatList: [], requests: [], searchResults: [], activeTab: "chats", typing: false,
  messageSearch: "", messageMatchIds: [], messageSearchOpen: false, matchIndex: 0,
  editingMessage: null, replyingTo: null, conversationVibe: "neutral",
  relationshipType: "", relationshipCustom: "", myMode: null, theirMode: null,
  appearance: { wallpaper: "default", bubbleStyle: "classic" }, conversationLocked: false,
  defaultDisappearing: false, rituals: [], memories: [], settingsPanel: null,
  vibePickerOpen: false, isVibeSaving: false, vibePromptHiddenFor: {},
  conversationStatus: null, conversationInitiatedBy: null, openConversationId: null, requestBusy: false,
};

export const useChatStore = create((set, get) => ({
  ...chatSessionState, loadToken: 0,
  getUsers: async () => {},
  getChats: async () => {
    const ownerId = useAuth.getState().authUser?._id;
    try {
      const { data } = await axiosInstance.get("/messages/conversations");
      if (useAuth.getState().authUser?._id !== ownerId) return;
      const me = useAuth.getState().authUser;
      const chats = await Promise.all(data.map(async (chat) => ({
        ...chat,
        lastPreview: await lastPreview(chat, me),
      })));
      if (useAuth.getState().authUser?._id !== ownerId) return;
      set({ chatList: sortChats(chats) });
    } catch (error) { toast.error(error.response?.data?.message || "Failed to fetch chats."); }
  },
  getRequests: async () => {
    const ownerId = useAuth.getState().authUser?._id;
    try {
      const { data } = await axiosInstance.get("/messages/requests");
      if (useAuth.getState().authUser?._id !== ownerId) return;
      set({ requests: data });
    }
    catch (error) { toast.error(error.response?.data?.message || "Failed to fetch requests."); }
  },
  searchUsers: async (query) => {
    if (!query.trim()) return set({ searchResults: [] });
    try { const { data } = await axiosInstance.get("/messages/search", { params: { q: query } }); set({ searchResults: data }); }
    catch (error) { toast.error(error.response?.data?.message || "Search failed."); }
  },
  getMessages: async (userId) => {
    const token = get().loadToken + 1;
    set({ isMessageLoading: true, loadToken: token, hasMore: false, messages: [] });
    try {
      const { data } = await axiosInstance.get(`/messages/${userId}`, { params: { limit: 50 } });
      if (get().loadToken !== token || get().selectedUser?._id !== userId) return;
      const page = parseMessagePage(data);
      const stubs = page.messages.map(asPendingMessage);
      set({ messages: stubs, hasMore: page.hasMore, isMessageLoading: false });
      await waitForEncryptionInit();
      const peer = get().selectedUser;
      const hydrated = await Promise.all(stubs.map((message) => hydrate(message, peer)));
      if (get().loadToken !== token || get().selectedUser?._id !== userId) return;
      set({ messages: hydrated });
      set((state) => ({
        chatList: state.chatList.map((chat) => idsEqual(chat.user?._id, userId) ? { ...chat, unreadCount: 0 } : chat),
      }));
    } catch (error) {
      if (get().loadToken !== token) return;
      toast.error(error.response?.data?.message || "Failed to load messages.");
    } finally {
      if (get().loadToken === token) set({ isMessageLoading: false });
    }
  },
  retryPendingDecryption: async (options = {}) => {
    const { selectedUser, messages } = get();
    const selectedId = selectedUser?._id;
    const includeFailed = Boolean(options.includeFailed);
    const needsWork = (message) => (
      message.decryptStatus === "pending"
      || message.replyPreview?.decryptStatus === "pending"
      || (includeFailed && (message.decryptStatus === "failed" || message.replyPreview?.decryptStatus === "failed"))
    );
    if (!messages.some(needsWork)) return;
    const hydrated = await Promise.all(messages.map((message) => (
      needsWork(message) ? hydrate(message, selectedUser) : message
    )));
    if (get().selectedUser?._id !== selectedId) return;
    set({ messages: hydrated });
  },
  loadOlderMessages: async () => {
    const { selectedUser, messages, hasMore, isLoadingOlder } = get();
    if (!selectedUser || !hasMore || isLoadingOlder || !messages.length) return false;
    set({ isLoadingOlder: true });
    try {
      const { data } = await axiosInstance.get(`/messages/${selectedUser._id}`, {
        params: { limit: 50, before: messages[0]._id },
      });
      if (get().selectedUser?._id !== selectedUser._id) return false;
      const page = parseMessagePage(data);
      const peerId = selectedUser._id;
      const stubs = page.messages.map(asPendingMessage);
      const existing = new Set(get().messages.map((message) => String(message._id)));
      const prepend = stubs.filter((message) => !existing.has(String(message._id)));
      set({
        messages: [...prepend, ...get().messages],
        hasMore: page.hasMore,
        isLoadingOlder: false,
      });
      const older = await Promise.all(prepend.map((message) => hydrate(message, selectedUser)));
      if (get().selectedUser?._id !== peerId) return false;
      const olderById = new Map(older.map((message) => [String(message._id), message]));
      set((state) => ({
        messages: state.messages.map((message) => olderById.get(String(message._id)) || message),
      }));
      return older.length > 0;
    } catch {
      set({ isLoadingOlder: false });
      return false;
    }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages, replyingTo, sending } = get();
    const me = useAuth.getState().authUser;
    if (!selectedUser || sending || !composerAllowed(get())) return;
    const tempId = `temp-${Date.now()}`;
    const pending = {
      _id: tempId,
      senderId: me._id,
      receiverId: selectedUser._id,
      displayText: messageData.text || "",
      image: messageData.image || "",
      createdAt: new Date().toISOString(),
      seen: false,
      pending: true,
      decryptStatus: "decrypted",
      deleted: false,
      replyPreview: replyingTo ? { ...replyingTo, displayText: replyingTo.displayText } : null,
    };
    set({ messages: [...messages, pending], sending: true, replyingTo: null });
    try {
      const text = await encryptText(messageData.text || "", me, selectedUser);
      const { data } = await axiosInstance.post(`/messages/send/${selectedUser._id}`, {
        ...messageData,
        text,
        replyTo: replyingTo?._id || null,
      });
      const hydrated = await hydrate(data, selectedUser);
      const keepPlaintext = hydrated.decryptStatus !== "decrypted" && messageData.text;
      const nextMessage = keepPlaintext
        ? { ...hydrated, displayText: messageData.text, decryptStatus: "decrypted" }
        : hydrated;
      set((state) => ({
        sending: false,
        messages: hasMessage(state.messages, nextMessage._id)
          ? state.messages.filter((message) => message._id !== tempId)
          : state.messages.map((message) => message._id === tempId ? nextMessage : message),
      }));
    } catch (error) {
      set((state) => ({ sending: false, messages: state.messages.filter((message) => message._id !== tempId) }));
      toast.error(error.response?.data?.message || "Failed to send message.");
    }
  },
  editMessage: async (messageId, text) => {
    if (!composerAllowed(get())) return;
    const { selectedUser } = get();
    const previous = get().messages.find((message) => message._id === messageId);
    set((state) => ({
      editingMessage: null,
      messages: state.messages.map((message) => message._id === messageId ? { ...message, displayText: text, edited: true } : message),
    }));
    try {
      const encrypted = await encryptText(text, useAuth.getState().authUser, selectedUser);
      const { data } = await axiosInstance.patch(`/messages/${messageId}`, { text: encrypted });
      const updated = await hydrate(data, selectedUser);
      set((state) => ({
        messages: state.messages.map((message) => message._id === messageId ? { ...updated, replyPreview: message.replyPreview } : message),
      }));
    } catch (error) {
      if (previous) set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? previous : message) }));
      toast.error(error.response?.data?.message || "Could not edit message.");
    }
  },
  deleteMessage: async (messageId) => {
    const previous = get().messages.find((message) => message._id === messageId);
    set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? { ...message, deleted: true, displayText: "", image: "", replyPreview: null } : message) }));
    try {
      await axiosInstance.delete(`/messages/${messageId}`);
    } catch (error) {
      if (previous) set((state) => ({ messages: state.messages.map((message) => message._id === messageId ? previous : message) }));
      toast.error(error.response?.data?.message || "Could not delete message.");
    }
  },
  searchMessages: async (query) => {
    set({ messageSearch: query, matchIndex: 0 });
    const localIds = get().messages.filter((message) => message.displayText?.toLowerCase().includes(query.toLowerCase())).map((message) => message._id);
    if (!query.trim() || !get().selectedUser) return set({ messageMatchIds: [] });
    try {
      const { data } = await axiosInstance.get(`/messages/conversation/${get().selectedUser._id}/search`, { params: { q: query } });
      set({ messageMatchIds: [...new Set([...localIds, ...data.map((message) => message._id)])] });
    } catch { set({ messageMatchIds: localIds }); }
  },
  goToMatch: (direction = 1) => {
    const ids = get().messageMatchIds;
    if (!ids.length) return;
    const next = (get().matchIndex + direction + ids.length) % ids.length;
    set({ matchIndex: next });
    document.getElementById(`msg-${ids[next]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  pruneExpired: () => set((state) => ({
    messages: state.messages.filter((message) => !message.expiresAt || new Date(message.expiresAt) > new Date()),
  })),
  respondToRequest: async (id, action) => {
    if (!id || get().requestBusy) return;
    set({ requestBusy: true });
    try {
      const { data } = await axiosInstance.put(`/messages/requests/${id}/${action}`);
      get().applyConversationResponse(data);
      return data;
    } catch (error) {
      set({ requestBusy: false });
      toast.error(error.response?.data?.message || "Could not update request.");
    }
  },
  applyConversationResponse: (conversation) => {
    if (!conversation?._id) return set({ requestBusy: false });
    const myId = useAuth.getState().authUser?._id;
    const other = participantNotMe(conversation, myId);
    const open = get().selectedUser && other && idsEqual(get().selectedUser._id, other._id);
    set((state) => ({
      requestBusy: false,
      requests: state.requests.filter((request) => !idsEqual(request._id, conversation._id)),
      conversationStatus: open ? conversation.status : state.conversationStatus,
      conversationInitiatedBy: open ? (conversation.initiatedBy?._id || conversation.initiatedBy) : state.conversationInitiatedBy,
      openConversationId: open ? conversation._id : state.openConversationId,
      activeTab: conversation.status === "accepted" ? "chats" : state.activeTab,
      editingMessage: open && conversation.status !== "accepted" ? null : state.editingMessage,
      replyingTo: open && conversation.status !== "accepted" ? null : state.replyingTo,
    }));
    if (conversation.status === "accepted" || conversation.status === "declined") get().getChats();
  },
  subscribeToMessages: () => {
    const socket = useAuth.getState().socket;
    if (!socket) return;
    socket.off("newMessage").on("newMessage", async (message) => {
      if (import.meta.env.DEV) {
        console.info("[socket] newMessage", { id: String(message?._id || ""), conversationPeer: String(message?.senderId || "") });
      }
      const me = useAuth.getState().authUser;
      const selected = get().selectedUser;
      if (hasMessage(get().messages, message._id)) return;
      const mine = idsEqual(message.senderId, me?._id);
      const inView = selected && (idsEqual(message.senderId, selected._id) || (mine && idsEqual(message.receiverId, selected._id)));
      if (inView) {
        const selectedId = selected._id;
        const pendingIndex = get().messages.findIndex((item) => item.pending && idsEqual(item.senderId, message.senderId));
        if (pendingIndex < 0) {
          const stub = asPendingMessage(message);
          set((state) => {
            if (hasMessage(state.messages, message._id)) return state;
            return { messages: [...state.messages, stub] };
          });
        }
        const hydrated = await hydrate(message, selected);
        if (get().selectedUser?._id !== selectedId) return;
        set((state) => {
          if (hasMessage(state.messages, message._id) && pendingIndex < 0) {
            return { messages: state.messages.map((item) => idsEqual(item._id, message._id) ? preferExistingPlaintext(item, hydrated) : item) };
          }
          const next = [...state.messages];
          const livePending = next.findIndex((item) => item.pending && idsEqual(item.senderId, message.senderId));
          if (livePending >= 0) next.splice(livePending, 1, preferExistingPlaintext(next[livePending], hydrated));
          else if (!hasMessage(next, message._id)) next.push(hydrated);
          else return { messages: next.map((item) => idsEqual(item._id, message._id) ? preferExistingPlaintext(item, hydrated) : item) };
          return { messages: next };
        });
      } else if (!mine) {
        set((state) => ({
          chatList: sortChats(state.chatList.map((chat) => idsEqual(chat.user?._id, message.senderId)
            ? { ...chat, unreadCount: (chat.unreadCount || 0) + 1, updatedAt: message.createdAt, lastPreview: "New message" }
            : chat)),
        }));
        const chat = get().chatList.find((item) => idsEqual(item.user?._id, message.senderId));
        if (!chat?.muted) notifyIncomingMessage({ title: "New message", body: "You have a new message", tag: String(message._id) });
      }
    });
    socket.off("messagesSeen").on("messagesSeen", ({ messageIds }) => set((state) => ({ messages: state.messages.map((message) => messageIds.includes(String(message._id)) || messageIds.includes(message._id) ? { ...message, seen: true } : message) })));
    socket.off("messageEdited").on("messageEdited", async (message) => {
      if (!get().messages.some((item) => idsEqual(item._id, message._id))) return;
      const peer = get().selectedUser;
      const updated = await hydrate(message, peer);
      if (get().selectedUser?._id !== peer?._id) return;
      set((state) => ({ messages: state.messages.map((item) => idsEqual(item._id, message._id) ? { ...updated, replyPreview: item.replyPreview } : item) }));
    });
    socket.off("messageDeleted").on("messageDeleted", ({ _id }) => set((state) => ({ messages: state.messages.map((message) => idsEqual(message._id, _id) ? { ...message, deleted: true, text: "", image: "", displayText: "", replyPreview: null } : message) })));
    socket.off("typing").on("typing", ({ from }) => { if (idsEqual(from, get().selectedUser?._id)) set({ typing: true }); });
    socket.off("stopTyping").on("stopTyping", ({ from }) => { if (idsEqual(from, get().selectedUser?._id)) set({ typing: false }); });
    socket.off("conversationRequest").on("conversationRequest", (request) => {
      const myId = useAuth.getState().authUser?._id;
      const user = request.participants?.find((participant) => !idsEqual(participant._id, myId));
      if (!user) return;
      set((state) => ({ requests: [{ ...request, user }, ...state.requests.filter((item) => item._id !== request._id)] }));
      toast("New conversation request");
    });
    socket.off("conversationUpdated").on("conversationUpdated", (conversation) => {
      const myId = useAuth.getState().authUser?._id;
      const other = participantNotMe(conversation, myId);
      const open = get().selectedUser && other && idsEqual(get().selectedUser._id, other._id);
      get().applyConversationResponse(conversation);
      const iAmInitiator = idsEqual(conversation.initiatedBy?._id || conversation.initiatedBy, myId);
      if (conversation.status === "declined" && iAmInitiator && !open) {
        toast("Your conversation request was rejected.");
      }
    });
    socket.off("conversationMoodUpdated").on("conversationMoodUpdated", (payload) => {
      useConversationThemeStore.getState().setMoodFromSocket(payload);
      if (!payload?.userId) return;
      set((state) => ({
        chatList: state.chatList.map((chat) => idsEqual(chat.user?._id, payload.userId)
          ? { ...chat, user: { ...chat.user, mood: payload.mood, moodUpdatedAt: payload.updatedAt } }
          : chat),
      }));
    });
    socket.off("conversationVibeUpdated").on("conversationVibeUpdated", (payload) => {
      if (!payload?.conversationId) return;
      const vibe = payload.conversationVibe || "neutral";
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      set((state) => ({
        conversationVibe: idsEqual(openId, payload.conversationId) ? vibe : state.conversationVibe,
        chatList: state.chatList.map((chat) => idsEqual(chat._id, payload.conversationId) ? { ...chat, conversationVibe: vibe } : chat),
      }));
    });
    socket.off("conversationMetaUpdated").on("conversationMetaUpdated", (payload) => {
      if (!payload?.conversationId) return;
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      if (!idsEqual(openId, payload.conversationId)) return;
      set((state) => ({
        relationshipType: payload.relationshipType || "",
        relationshipCustom: payload.relationshipCustom || "",
        appearance: payload.appearance || state.appearance,
        defaultDisappearing: Boolean(payload.defaultDisappearing),
        chatList: state.chatList.map((chat) => idsEqual(chat._id, payload.conversationId)
          ? { ...chat, relationshipType: payload.relationshipType || "", conversationVibe: payload.conversationVibe || chat.conversationVibe }
          : chat),
      }));
    });
    socket.off("conversationModeUpdated").on("conversationModeUpdated", (payload) => {
      if (!payload?.conversationId) return;
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      if (!idsEqual(openId, payload.conversationId)) return;
      set({ theirMode: payload.mode });
    });
    socket.off("conversationStatusUpdated").on("conversationStatusUpdated", (payload) => {
      if (!payload?.userId) return;
      useConversationThemeStore.setState((state) => (
        idsEqual(state.selectedPeerId, payload.userId) ? { theirAvailability: payload.availability } : state
      ));
      set((state) => ({
        chatList: state.chatList.map((chat) => idsEqual(chat.user?._id, payload.userId)
          ? { ...chat, user: { ...chat.user, availability: payload.availability } }
          : chat),
      }));
    });
    const applyReactions = (payload) => {
      if (!payload?.messageId) return;
      set((state) => ({ messages: state.messages.map((message) => idsEqual(message._id, payload.messageId) ? { ...message, reactions: payload.reactions || [] } : message) }));
    };
    socket.off("messageReactionAdded").on("messageReactionAdded", applyReactions);
    socket.off("messageReactionUpdated").on("messageReactionUpdated", applyReactions);
    socket.off("messageReactionRemoved").on("messageReactionRemoved", applyReactions);
    socket.off("conversationMemoryCreated").on("conversationMemoryCreated", (payload) => {
      if (!payload?.memory) return;
      set((state) => ({ memories: [payload.memory, ...state.memories.filter((item) => item._id !== payload.memory._id)] }));
    });
    socket.off("conversationMemoryDeleted").on("conversationMemoryDeleted", (payload) => {
      set((state) => ({ memories: state.memories.filter((item) => !idsEqual(item._id, payload.memoryId)) }));
    });
    socket.off("ritualUpdated").on("ritualUpdated", (payload) => {
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      if (!idsEqual(openId, payload?.conversationId)) return;
      set({ rituals: payload.rituals || [] });
    });
  },
  unsubscribeFromMessages: () => ["newMessage", "messagesSeen", "messageEdited", "messageDeleted", "typing", "stopTyping", "conversationRequest", "conversationUpdated", "conversationMoodUpdated", "conversationVibeUpdated", "conversationMetaUpdated", "conversationModeUpdated", "conversationStatusUpdated", "messageReactionAdded", "messageReactionUpdated", "messageReactionRemoved", "conversationMemoryCreated", "conversationMemoryDeleted", "ritualUpdated"].forEach((event) => useAuth.getState().socket?.off(event)),
  resetChatState: () => {
    get().unsubscribeFromMessages();
    set({ ...chatSessionState, loadToken: get().loadToken + 1 });
  },
  closeConversation: () => {
    set({
      selectedUser: null,
      messages: [],
      typing: false,
      messageSearch: "",
      messageMatchIds: [],
      messageSearchOpen: false,
      matchIndex: 0,
      editingMessage: null,
      replyingTo: null,
      conversationVibe: "neutral",
      relationshipType: "",
      relationshipCustom: "",
      myMode: null,
      theirMode: null,
      appearance: { wallpaper: "default", bubbleStyle: "classic" },
      conversationLocked: false,
      defaultDisappearing: false,
      rituals: [],
      memories: [],
      settingsPanel: null,
      vibePickerOpen: false,
      isVibeSaving: false,
      hasMore: false,
      isMessageLoading: false,
      conversationStatus: null,
      conversationInitiatedBy: null,
      openConversationId: null,
    });
    useConversationThemeStore.getState().clearConversationMood();
  },
  setSelectedUser: (selectedUser) => {
    const currentId = get().selectedUser?._id;
    if (!selectedUser || (currentId && String(currentId) === String(selectedUser._id))) {
      get().closeConversation();
      return;
    }
    const match = get().chatList.find((chat) => String(chat.user?._id) === String(selectedUser._id))
      || get().requests.find((request) => String(request.user?._id) === String(selectedUser._id));
    set({
      selectedUser: {
        ...selectedUser,
        encryptionPublicKey: selectedUser.encryptionPublicKey || match?.user?.encryptionPublicKey,
      },
      conversationVibe: match?.conversationVibe || "neutral",
      relationshipType: match?.relationshipType || "",
      conversationStatus: match?.status || null,
      conversationInitiatedBy: match?.initiatedBy?._id || match?.initiatedBy || null,
      openConversationId: match?._id || null,
      myMode: null,
      theirMode: null,
      appearance: { wallpaper: "default", bubbleStyle: "classic" },
      conversationLocked: false,
      defaultDisappearing: false,
      rituals: [],
      memories: [],
      settingsPanel: null,
      vibePickerOpen: false,
      isVibeSaving: false,
      messages: [],
      typing: false,
      messageSearch: "",
      messageMatchIds: [],
      messageSearchOpen: false,
      editingMessage: null,
      replyingTo: null,
      hasMore: false,
      matchIndex: 0,
    });
  },
  getConversationDetails: async () => {
    const { selectedUser } = get();
    const conversationId = conversationIdForUser(get(), selectedUser?._id);
    if (!conversationId) return set({ conversationVibe: "neutral" });
    try {
      const { data } = await axiosInstance.get(`/messages/conversation/${conversationId}`);
      if (get().selectedUser?._id !== selectedUser._id) return;
      const myId = useAuth.getState().authUser?._id;
      const peer = (data.participants || []).find((participant) => String(participant._id) !== String(myId));
      const encryptionPublicKey = toPublicJwk(peer?.encryptionPublicKey)
        || toPublicJwk(get().selectedUser?.encryptionPublicKey);
      set({
        conversationVibe: data.conversationVibe || "neutral",
        relationshipType: data.relationshipType || "",
        relationshipCustom: data.relationshipCustom || "",
        myMode: data.myMode || null,
        theirMode: data.theirMode || null,
        appearance: data.appearance || { wallpaper: "default", bubbleStyle: "classic" },
        conversationLocked: Boolean(data.locked),
        defaultDisappearing: Boolean(data.defaultDisappearing),
        rituals: data.rituals || [],
        conversationStatus: data.status || null,
        conversationInitiatedBy: data.initiatedBy?._id || data.initiatedBy || null,
        openConversationId: data._id || data.conversationId || get().openConversationId,
        selectedUser: encryptionPublicKey && get().selectedUser
          ? { ...get().selectedUser, encryptionPublicKey }
          : get().selectedUser,
        chatList: encryptionPublicKey
          ? get().chatList.map((chat) => idsEqual(chat.user?._id, peer?._id)
            ? { ...chat, user: { ...chat.user, encryptionPublicKey } }
            : chat)
          : get().chatList,
      });
      await get().retryPendingDecryption({ includeFailed: true });
    } catch {
      if (get().selectedUser?._id !== selectedUser._id) return;
      set({ conversationVibe: "neutral" });
    }
  },
  updateConversationVibe: async (key) => {
    const { selectedUser } = get();
    const conversationId = conversationIdForUser(get(), selectedUser?._id);
    if (!conversationId || get().isVibeSaving) return false;
    set({ isVibeSaving: true });
    try {
      const { data } = await axiosInstance.patch(`/messages/conversation/${conversationId}/vibe`, { key });
      const vibe = data.conversationVibe || "neutral";
      set((state) => ({
        conversationVibe: vibe,
        isVibeSaving: false,
        vibePickerOpen: false,
        vibePromptHiddenFor: { ...state.vibePromptHiddenFor, [conversationId]: true },
        chatList: state.chatList.map((chat) => idsEqual(chat._id, conversationId) ? { ...chat, conversationVibe: vibe } : chat),
      }));
      toast.success(`Conversation vibe changed to ${getVibeMeta(vibe).label}`);
      return true;
    } catch (error) {
      set({ isVibeSaving: false });
      toast.error(error.response?.data?.message || "Could not update conversation vibe.");
      return false;
    }
  },
  openVibePicker: () => set({ vibePickerOpen: true }),
  closeVibePicker: () => set({ vibePickerOpen: false }),
  dismissVibePrompt: () => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    set((state) => ({ vibePromptHiddenFor: { ...state.vibePromptHiddenFor, [conversationId]: true } }));
  },
  setSettingsPanel: (settingsPanel) => set({ settingsPanel }),
  patchConversationMeta: async (body) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      const { data } = await axiosInstance.patch(`/messages/conversation/${conversationId}/meta`, body);
      set({
        relationshipType: data.relationshipType || "",
        relationshipCustom: data.relationshipCustom || "",
        appearance: data.appearance || get().appearance,
        conversationLocked: Boolean(data.locked),
        defaultDisappearing: Boolean(data.defaultDisappearing),
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update conversation.");
    }
  },
  updateMyMode: async (key, until) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      const { data } = await axiosInstance.patch(`/messages/conversation/${conversationId}/mode`, { key, until });
      set({ myMode: data.myMode || null });
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update mode.");
    }
  },
  updateAvailability: async (key, until) => {
    try {
      const { data } = await axiosInstance.put("/messages/me/availability", { key, until });
      const authUser = useAuth.getState().authUser;
      if (authUser) useAuth.setState({ authUser: { ...authUser, availability: data.availability } });
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update availability.");
    }
  },
  reactToMessage: async (messageId, key) => {
    if (!composerAllowed(get())) return;
    try {
      const { data } = await axiosInstance.put(`/messages/${messageId}/reaction`, { key });
      set((state) => ({ messages: state.messages.map((message) => idsEqual(message._id, messageId) ? { ...message, reactions: data.reactions } : message) }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not react.");
    }
  },
  clearReaction: async (messageId) => {
    if (!composerAllowed(get())) return;
    try {
      const { data } = await axiosInstance.delete(`/messages/${messageId}/reaction`);
      set((state) => ({ messages: state.messages.map((message) => idsEqual(message._id, messageId) ? { ...message, reactions: data.reactions } : message) }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not remove reaction.");
    }
  },
  loadMemories: async () => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      const { data } = await axiosInstance.get(`/messages/conversation/${conversationId}/memories`);
      set({ memories: data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load memories.");
    }
  },
  createMemory: async (body) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      const { data } = await axiosInstance.post(`/messages/conversation/${conversationId}/memories`, body);
      set((state) => ({ memories: [data, ...state.memories] }));
      toast.success("Memory saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save memory.");
    }
  },
  deleteMemory: async (memoryId) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      await axiosInstance.delete(`/messages/conversation/${conversationId}/memories/${memoryId}`);
      set((state) => ({ memories: state.memories.filter((item) => !idsEqual(item._id, memoryId)) }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete memory.");
    }
  },
  upsertRitual: async (body) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      const { data } = await axiosInstance.put(`/messages/conversation/${conversationId}/rituals`, body);
      set({ rituals: data.rituals || [] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update ritual.");
    }
  },
  deleteRitual: async (key) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      const { data } = await axiosInstance.delete(`/messages/conversation/${conversationId}/rituals/${key}`);
      set({ rituals: data.rituals || [] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete ritual.");
    }
  },
  setActiveTab: (activeTab) => set({ activeTab, searchResults: [] }),
  setChatList: (chatList) => set({ chatList: sortChats(chatList) }),
  setMessageSearchOpen: (messageSearchOpen) => set({ messageSearchOpen, ...(messageSearchOpen ? {} : { messageSearch: "", messageMatchIds: [] }) }),
  setEditingMessage: (editingMessage) => set({ editingMessage, replyingTo: null }),
  setReplyingTo: (replyingTo) => set({ replyingTo, editingMessage: null }),
}));
