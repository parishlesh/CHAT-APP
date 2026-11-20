import toast from "react-hot-toast";
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { decryptMessage, encryptText, isEncryptedText, resolveConversationPeerKey, toPublicJwk, waitForEncryptionInit, cacheEncryptedMessages, readCachedMessages, getEncryptionStatus, isEncryptionReady, getEncryptionFailure, clearDecryptCache } from "../lib/encryption";
import { notifyIncomingMessage } from "../lib/notify";
import { getVibeMeta } from "../config/conversationVibes";
import { canComposeInConversation } from "../lib/conversationAccess";
import { mediaLabel, uploadMedia } from "../lib/media";
import { useAuth } from "./useAuth";
import { useConversationThemeStore } from "./useConversationThemeStore";

const sortChats = (items) => [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
const idsEqual = (a, b) => String(a) === String(b);
const conversationIdForUser = (state, userId) => {
  if (!userId) return null;
  return state.chatList.find((chat) => String(chat.user?._id) === String(userId))?._id
    || state.requests.find((request) => String(request.user?._id) === String(userId))?._id
    || state.rejected.find((item) => String(item.user?._id) === String(userId))?._id
    // Chats opened from search may not be in any list yet; the server tells us their id with the messages.
    || (state.selectedUser && String(state.selectedUser._id) === String(userId) ? state.openConversationId : null)
    || null;
};
const hasMessage = (messages, id) => messages.some((message) => idsEqual(message._id, id));

const sendLog = (stage, extra = {}) => {
  if (!import.meta.env.DEV) return;
  console.info("[CHAT SEND]", { stage, ...extra });
};

const listedPeerFor = (state, userId) => (
  state.chatList.find((chat) => idsEqual(chat.user?._id, userId))?.user
  || state.requests.find((request) => idsEqual(request.user?._id, userId))?.user
);

const sendFailureMessage = (error) => {
  const code = error?.response?.data?.message || error?.message || "";
  if (code === "NO_PEER_KEY") return "This contact's encryption key isn't available yet.";
  if (code === "KEY_BACKUP_REQUIRED") {
    return "This device is missing your encryption key. Use the banner at the top, or sign in on a device that still has the key.";
  }
  if (code === "ENCRYPTION_NOT_READY" || code === "KEY_NOT_RESTORED") {
    return "Secure messaging isn't ready. Try logging in again.";
  }
  if (code === "E2E_IDENTITY_MISMATCH") return "Encryption identity doesn't match this account.";
  if (code === "CRYPTO_UNAVAILABLE") return "This browser can't encrypt messages.";
  if (code === "missing local identity") return "Secure messaging isn't ready. Try logging in again.";
  return error?.response?.data?.message || "Failed to send message.";
};

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
  const decryptMeta = { messageId: message._id, senderId: message.senderId, recipientId: message.receiverId };
  const result = await decryptMessage(message.text, me, other, decryptMeta);
  let replyPreview = null;
  if (message.replyTo && typeof message.replyTo === "object" && message.replyTo._id) {
    const replyResult = message.replyTo.deleted
      ? { status: "decrypted", text: "" }
      : await decryptMessage(message.replyTo.text, me, other, decryptMeta);
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
  if (last.locked || chat.locked) return "🔒 Locked chat";
  if (last.deleted) return "This message was deleted";
  if (last.kind === "system" || last.systemEvent) return last.text || "This user has rejected your conversation request.";
  const media = last.attachment?.url ? mediaLabel(last.attachment) : last.image ? "📷 Photo" : "";
  if (media && !last.text) return media;
  const result = await decryptMessage(last.text, me, chat.user);
  if (result.status !== "decrypted" || isEncryptedText(result.text)) return media || "Message";
  if (media) return result.text ? `${media.split(" ")[0]} ${result.text}` : media;
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
  return canComposeInConversation(conversationStatus, conversationInitiatedBy, me);
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
  if (Array.isArray(data)) return { messages: data, hasMore: false, conversation: null };
  return { messages: data?.messages || [], hasMore: Boolean(data?.hasMore), conversation: data?.conversation || null };
};

const chatSessionState = {
  messages: [], selectedUser: null, isUserLoading: false, isMessageLoading: false,
  isLoadingOlder: false, hasMore: false, sending: false,
  chatList: [], requests: [], rejected: [], searchResults: [], chatsLoaded: false, activeTab: "chats", typing: false,
  messageSearch: "", messageMatchIds: [], messageSearchOpen: false, matchIndex: 0,
  editingMessage: null, replyingTo: null, conversationVibe: "neutral",
  relationshipType: "", relationshipCustom: "", myMode: null, theirMode: null,
  appearance: { wallpaper: "default", bubbleStyle: "classic" }, conversationLocked: false,
  defaultDisappearing: false, rituals: [], memories: [], settingsPanel: null,
  vibePickerOpen: false, isVibeSaving: false, vibePromptHiddenFor: {},
  conversationStatus: null, conversationInitiatedBy: null, openConversationId: null, requestBusy: false,
  drafts: {},
  pinnedMessages: [], viewer: null, queuedFile: null, forwarding: null,
  unlockTokens: {}, lockGate: false,
};

// ---- Sending & receipts ----------------------------------------------------------------------
let tempCounter = 0;
let sendQueue = Promise.resolve();
// What's needed to retry a failed send (kept outside React state because it may hold a File).
const retryPayloads = new Map();

const describeSendError = (error) => {
  if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") return "Upload cancelled.";
  return error?.response?.data?.error?.message || sendFailureMessage(error);
};

// A "delivered" or "seen" receipt can arrive before our own copy of the message is in the list
// (e.g. while the send request is still finishing). Remember it and apply it when the message lands.
const earlyReceipts = new Map();
const rememberReceipt = (id, patch) => {
  const key = String(id);
  earlyReceipts.set(key, { ...(earlyReceipts.get(key) || {}), ...patch });
  if (earlyReceipts.size > 500) earlyReceipts.delete(earlyReceipts.keys().next().value);
};
const withEarlyReceipts = (message) => {
  const receipt = earlyReceipts.get(String(message?._id));
  if (!receipt) return message;
  earlyReceipts.delete(String(message._id));
  return { ...message, ...receipt };
};

// ---- Speed helpers -------------------------------------------------------------------------

// Recently opened chats (already decrypted) kept in memory so switching back is instant.
const RECENT_CHAT_LIMIT = 10;
const recentChats = new Map();
const rememberChat = (peerId, messages, hasMore) => {
  if (!peerId) return;
  const key = String(peerId);
  recentChats.delete(key);
  const settled = messages.filter((message) => message.failed || (!message.pending && !String(message._id).startsWith("temp-")));
  if (!settled.length) return;
  recentChats.set(key, { messages: settled, hasMore });
  if (recentChats.size > RECENT_CHAT_LIMIT) recentChats.delete(recentChats.keys().next().value);
};

// Several components and the socket "connect" handler ask for the same lists at the same moment.
// Share the request that's already running and skip refetches of data that is only seconds old.
const inflight = new Map();
const fetchedAt = new Map();
const fetchOnce = (key, fn, { maxAgeMs = 0, force = false } = {}) => {
  if (maxAgeMs && Date.now() - (fetchedAt.get(key) || 0) < maxAgeMs) return Promise.resolve();
  // force: something changed after the running request started, so run once more when it finishes.
  if (inflight.has(key)) return force ? inflight.get(key).then(() => fetchOnce(key, fn)) : inflight.get(key);
  const run = Promise.resolve().then(fn).finally(() => {
    inflight.delete(key);
    fetchedAt.set(key, Date.now());
  });
  inflight.set(key, run);
  return run;
};

const unlockHeaderFor = (state, conversationId) => {
  const entry = conversationId ? state.unlockTokens[String(conversationId)] : null;
  if (!entry || new Date(entry.expiresAt).getTime() < Date.now() + 5000) return {};
  return { "x-chat-unlock": entry.token };
};

const chatEntryFor = (state, userId) => state.chatList.find((chat) => idsEqual(chat.user?._id, userId));

// Leaving a locked chat locks it again (its unlock token is dropped), like other chat apps.
const relockedTokens = (state, conversationId) => {
  if (!conversationId || !state.unlockTokens[String(conversationId)]) return state.unlockTokens;
  const next = { ...state.unlockTokens };
  delete next[String(conversationId)];
  return next;
};

const quickPreview = (chat) => {
  const last = chat.lastMessage;
  if (!last) return "";
  if (last.locked || chat.locked) return "🔒 Locked chat";
  if (last.deleted) return "This message was deleted";
  if (last.kind === "system" || last.systemEvent) return last.text || "This user has rejected your conversation request.";
  if (!isEncryptedText(last.text)) return null; // cheap to compute exactly
  return "…";
};

const isBlockedByMe = (userId) => (useAuth.getState().authUser?.blockedUsers || []).some((id) => idsEqual(id, userId));

const hydratePins = (pins, peer) => Promise.all((pins || []).map(async (pin) => ({
  ...pin,
  message: await hydrate({ ...pin.message, kind: "user", deleted: false }, peer),
})));

export const useChatStore = create((set, get) => ({
  ...chatSessionState, loadToken: 0,
  getUsers: async () => {},
  getChats: (options) => fetchOnce("chats", async () => {
    const ownerId = useAuth.getState().authUser?._id;
    try {
      const { data } = await axiosInstance.get("/messages/conversations");
      if (useAuth.getState().authUser?._id !== ownerId) return;
      const me = useAuth.getState().authUser;
      // Paint the list right away, reusing previews we already decrypted; fill in the rest after.
      const previous = new Map(get().chatList.map((chat) => [String(chat._id), chat]));
      const needsDecrypt = [];
      const quick = data.map((chat) => {
        const prior = previous.get(String(chat._id));
        if (prior && !prior.lastMessage?.stale && String(prior.lastMessage?._id || "") === String(chat.lastMessage?._id || "") && prior.lastPreview && prior.lastPreview !== "…") {
          return { ...chat, lastPreview: prior.lastPreview };
        }
        const cheap = quickPreview(chat);
        if (cheap === "…") needsDecrypt.push(chat);
        return { ...chat, lastPreview: cheap ?? chat.lastMessage?.text ?? "" };
      });
      set({ chatList: sortChats(quick), chatsLoaded: true });
      if (!needsDecrypt.length) return;
      const decrypted = new Map(await Promise.all(needsDecrypt.map(async (chat) => [String(chat._id), await lastPreview(chat, me)])));
      if (useAuth.getState().authUser?._id !== ownerId) return;
      set((state) => ({
        chatList: state.chatList.map((chat) => decrypted.has(String(chat._id)) && chat.lastPreview === "…"
          ? { ...chat, lastPreview: decrypted.get(String(chat._id)) }
          : chat),
      }));
    } catch (error) {
      set({ chatsLoaded: true });
      toast.error(error.response?.data?.message || "Failed to fetch chats.");
    }
  }, options),
  getRequests: (options) => fetchOnce("requests", async () => {
    const ownerId = useAuth.getState().authUser?._id;
    try {
      const { data } = await axiosInstance.get("/messages/requests");
      if (useAuth.getState().authUser?._id !== ownerId) return;
      set({ requests: data });
    }
    catch (error) { toast.error(error.response?.data?.message || "Failed to fetch requests."); }
  }, options),
  getRejected: (options) => fetchOnce("rejected", async () => {
    const ownerId = useAuth.getState().authUser?._id;
    try {
      const { data } = await axiosInstance.get("/messages/rejected");
      if (useAuth.getState().authUser?._id !== ownerId) return;
      set({ rejected: data });
    } catch {
      // Non-critical list; the Requests tab still works without it.
    }
  }, options),
  searchUsers: async (query) => {
    if (!query.trim()) return set({ searchResults: [] });
    try { const { data } = await axiosInstance.get("/messages/search", { params: { q: query } }); set({ searchResults: data }); }
    catch (error) { toast.error(error.response?.data?.message || "Search failed."); }
  },
  getMessages: async (userId) => {
    const token = get().loadToken + 1;
    const key = String(userId);
    const stillHere = () => get().loadToken === token && idsEqual(get().selectedUser?._id, userId);
    const conversationId = conversationIdForUser(get(), userId);
    const unlock = unlockHeaderFor(get(), conversationId);
    const knownLocked = Boolean(chatEntryFor(get(), userId)?.locked) && !unlock["x-chat-unlock"];
    set({ isMessageLoading: true, loadToken: token, hasMore: false, messages: [], lockGate: knownLocked });
    if (knownLocked) {
      // Ask for the PIN first; don't fetch or show anything from a locked chat.
      set({ isMessageLoading: false, conversationLocked: true });
      return;
    }
    let painted = false;
    try {
      // 1) Instant paint: this session's copy, else the device cache (decrypted locally, no network).
      const recent = recentChats.get(key);
      if (recent) {
        set({ messages: recent.messages, hasMore: recent.hasMore, isMessageLoading: false });
        painted = true;
      } else {
        const cached = await readCachedMessages(userId);
        if (stillHere() && cached.length) {
          const peer = get().selectedUser;
          const fromCache = await Promise.all(cached.map((message) => hydrate(asPendingMessage(message), peer)));
          if (stillHere()) {
            set({ messages: fromCache, hasMore: true, isMessageLoading: false });
            painted = true;
          }
        }
      }

      // 2) Fresh page from the server, swapped in once decrypted (no "please wait" flash).
      const { data } = await axiosInstance.get(`/messages/${userId}`, { params: { limit: 30 }, headers: unlock });
      if (!stillHere()) return;
      const page = parseMessagePage(data);
      const meta = page.conversation ? {
        conversationStatus: page.conversation.status,
        conversationInitiatedBy: page.conversation.initiatedBy,
        openConversationId: page.conversation._id,
        conversationLocked: Boolean(page.conversation.locked),
      } : {};
      // Locked chats are never written to the device cache.
      cacheEncryptedMessages(userId, page.conversation?.locked ? [] : page.messages).catch(() => {});
      const stubs = page.messages.map(asPendingMessage);
      if (!painted) set({ messages: stubs, hasMore: page.hasMore, isMessageLoading: false, ...meta });
      else set(meta);
      // Chats opened from search only learn their id here; load their settings now.
      if (!conversationId && page.conversation) get().getConversationDetails();
      await waitForEncryptionInit();
      const peer = get().selectedUser;
      const hydrated = await Promise.all(stubs.map((message) => hydrate(message, peer)));
      if (!stillHere()) return;
      // Keep anything that arrived over the socket while we were loading.
      const fresh = new Set(hydrated.map((message) => String(message._id)));
      const newest = hydrated[hydrated.length - 1]?.createdAt;
      const live = get().messages.filter((message) => !fresh.has(String(message._id))
        && (message.pending || message.failed || (newest && new Date(message.createdAt) > new Date(newest))));
      set({ messages: [...hydrated, ...live], hasMore: page.hasMore, isMessageLoading: false });
      set((state) => ({
        chatList: state.chatList.map((chat) => idsEqual(chat.user?._id, userId) ? { ...chat, unreadCount: 0 } : chat),
      }));
      fetchedAt.set(`messages:${key}`, Date.now());
    } catch (error) {
      if (!stillHere()) return;
      if (error.response?.status === 423) {
        recentChats.delete(key);
        set({ lockGate: true, messages: [], conversationLocked: true });
        return;
      }
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
        params: { limit: 30, before: messages[0]._id },
        headers: unlockHeaderFor(get(), conversationIdForUser(get(), selectedUser._id)),
      });
      if (get().selectedUser?._id !== selectedUser._id) return false;
      const page = parseMessagePage(data);
      if (!get().conversationLocked) cacheEncryptedMessages(selectedUser._id, [...page.messages, ...get().messages]).catch(() => {});
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
  // Sending is optimistic and queued: the bubble appears and the composer clears instantly,
  // you can keep sending, and messages still reach the server one after another, in order.
  sendMessage: (messageData) => {
    const { selectedUser } = get();
    // A retry carries its original reply target; a new message uses whatever is being replied to now.
    const retrying = Object.prototype.hasOwnProperty.call(messageData, "replyingTo");
    const replyingTo = retrying ? messageData.replyingTo : get().replyingTo;
    const me = useAuth.getState().authUser;
    if (!selectedUser || !composerAllowed(get())) return Promise.resolve(false);
    if (isBlockedByMe(selectedUser._id)) {
      toast.error("You blocked this contact. Unblock them to send a message.");
      return Promise.resolve(false);
    }
    tempCounter += 1;
    const tempId = `temp-${Date.now()}-${tempCounter}`;
    const { upload } = messageData;
    // Photos/videos/files/voice notes show straight away from the local file while they upload.
    const localAttachment = upload ? {
      kind: upload.kind,
      url: upload.previewUrl || URL.createObjectURL(upload.file),
      name: upload.file.name || "",
      bytes: upload.file.size,
      duration: upload.meta?.duration ?? null,
      width: upload.meta?.width ?? null,
      height: upload.meta?.height ?? null,
      local: true,
    } : null;
    const pending = {
      _id: tempId,
      senderId: me._id,
      receiverId: selectedUser._id,
      displayText: messageData.text || "",
      image: messageData.image || "",
      attachment: localAttachment || messageData.attachment || null,
      uploadProgress: upload ? 0 : null,
      createdAt: new Date().toISOString(),
      seen: false,
      delivered: false,
      pending: true,
      decryptStatus: "decrypted",
      deleted: false,
      replyPreview: replyingTo ? { ...replyingTo, displayText: replyingTo.displayText } : null,
    };
    set((state) => ({ messages: [...state.messages, pending], ...(retrying ? {} : { replyingTo: null }) }));
    retryPayloads.set(tempId, { messageData, replyingTo });
    const patchTemp = (patch) => set((state) => ({
      messages: state.messages.map((message) => message._id === tempId ? { ...message, ...patch } : message),
    }));
    const deliver = async () => {
    try {
      let attachment = messageData.attachment || null;
      if (upload) {
        attachment = await uploadMedia(upload.file, {
          kind: upload.kind,
          meta: upload.meta,
          onProgress: (progress) => patchTemp({ uploadProgress: progress }),
        });
        patchTemp({ uploadProgress: 100 });
      }
      sendLog("started", {
        recipientId: String(selectedUser._id),
        conversationId: conversationIdForUser(get(), selectedUser._id),
        encryptionStatus: getEncryptionStatus(),
        encryptionFailure: getEncryptionFailure(),
        hasText: Boolean(messageData.text),
        hasImage: Boolean(messageData.image),
      });
      await waitForEncryptionInit();
      sendLog("encryption-status", {
        encryptionStatus: getEncryptionStatus(),
        localIdentityReady: isEncryptionReady(),
        recipientPublicKeyPresent: Boolean(toPublicJwk(selectedUser.encryptionPublicKey)),
      });

      let peerPublic = resolveConversationPeerKey(me, selectedUser, listedPeerFor(get(), selectedUser._id));
      if (!peerPublic && messageData.text) {
        await get().getConversationDetails();
        await get().getChats();
        const fresh = get().selectedUser;
        peerPublic = resolveConversationPeerKey(me, fresh, listedPeerFor(get(), selectedUser._id));
      }
      if (!peerPublic && messageData.text && selectedUser.username) {
        const { data } = await axiosInstance.get("/messages/search", { params: { q: selectedUser.username } });
        const match = (data || []).find((user) => idsEqual(user._id, selectedUser._id));
        peerPublic = toPublicJwk(match?.encryptionPublicKey);
        sendLog("recipient-key-refreshed", { recipientPublicKeyPresent: Boolean(peerPublic) });
      }
      sendLog("recipient-key", { recipientPublicKeyPresent: Boolean(peerPublic) });

      const recipient = { ...selectedUser, encryptionPublicKey: peerPublic || selectedUser.encryptionPublicKey };
      if (peerPublic) {
        set((state) => (idsEqual(state.selectedUser?._id, selectedUser._id)
          ? { selectedUser: { ...state.selectedUser, encryptionPublicKey: peerPublic } }
          : state));
      }

      sendLog("encryption-started", { encryptionStatus: getEncryptionStatus() });
      const text = await encryptText(messageData.text || "", me, recipient);
      sendLog("encryption-succeeded", {
        envelopeVersion: text.startsWith("e2e:v3:") ? 3 : text.startsWith("e2e:v2:") ? 2 : text.startsWith("e2e:v1:") ? 1 : 0,
        envelopeLength: text.length,
        transport: "HTTP",
      });
      sendLog("transport-started", { url: `/messages/send/${selectedUser._id}` });
      const body = { ...messageData };
      delete body.upload;
      delete body.replyingTo;
      const { data } = await axiosInstance.post(`/messages/send/${selectedUser._id}`, {
        ...body,
        attachment,
        text,
        replyTo: replyingTo?._id || null,
      });
      sendLog("transport-succeeded", { messageId: String(data?._id || "") });
      const hydrated = withEarlyReceipts(await hydrate(data, recipient));
      const keepPlaintext = hydrated.decryptStatus !== "decrypted" && messageData.text;
      const nextMessage = keepPlaintext
        ? { ...hydrated, displayText: messageData.text, decryptStatus: "decrypted" }
        : hydrated;
      set((state) => ({
        messages: hasMessage(state.messages, nextMessage._id)
          ? state.messages.filter((message) => message._id !== tempId)
          : state.messages.map((message) => message._id === tempId ? nextMessage : message),
      }));
      retryPayloads.delete(tempId);
      if (localAttachment) setTimeout(() => URL.revokeObjectURL(localAttachment.url), 30000);
      return true;
    } catch (error) {
      sendLog("failed", {
        stage: error?.response ? "transport" : "pre-transport",
        name: error?.name,
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
      });
      if (import.meta.env.DEV) {
        console.error("[CHAT SEND] failed", {
          stage: error?.response ? "transport" : "pre-transport",
          name: error?.name,
          message: error?.message,
          code: error?.code,
          status: error?.response?.status,
        });
      }
      // Keep the message in the chat as "Not sent" with Retry, instead of pushing text back into the box.
      const reason = describeSendError(error);
      patchTemp({ pending: false, failed: true, failureReason: reason, uploadProgress: null });
      toast.error(reason);
      return false;
    }
    };
    const run = sendQueue.then(deliver);
    sendQueue = run.catch(() => false);
    return run;
  },
  retryMessage: (tempId) => {
    const saved = retryPayloads.get(tempId);
    const failed = get().messages.find((message) => message._id === tempId);
    if (!saved || !failed) return;
    retryPayloads.delete(tempId);
    const { messageData, replyingTo } = saved;
    // Re-send as a fresh message; reuse the local preview so media doesn't flicker.
    const upload = messageData.upload ? { ...messageData.upload, previewUrl: failed.attachment?.url } : undefined;
    set((state) => ({ messages: state.messages.filter((message) => message._id !== tempId) }));
    get().sendMessage({ ...messageData, upload, replyingTo: replyingTo || null });
  },
  discardFailedMessage: (tempId) => {
    const failed = get().messages.find((message) => message._id === tempId);
    if (failed?.attachment?.local) URL.revokeObjectURL(failed.attachment.url);
    retryPayloads.delete(tempId);
    set((state) => ({ messages: state.messages.filter((message) => message._id !== tempId) }));
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
      const me = useAuth.getState().authUser;
      const peerPublic = resolveConversationPeerKey(me, selectedUser, listedPeerFor(get(), selectedUser?._id));
      const encrypted = await encryptText(text, me, { ...selectedUser, encryptionPublicKey: peerPublic || selectedUser?.encryptionPublicKey });
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
  deleteMessage: async (messageId, scope = "everyone") => {
    const previousMessages = get().messages;
    const previousPins = get().pinnedMessages;
    if (scope === "me") {
      set((state) => ({
        messages: state.messages.filter((message) => !idsEqual(message._id, messageId)),
        pinnedMessages: state.pinnedMessages.filter((pin) => !idsEqual(pin.messageId, messageId)),
      }));
    } else {
      set((state) => ({
        messages: state.messages.map((message) => idsEqual(message._id, messageId) ? { ...message, deleted: true, displayText: "", image: "", attachment: null, replyPreview: null } : message),
        pinnedMessages: state.pinnedMessages.filter((pin) => !idsEqual(pin.messageId, messageId)),
      }));
    }
    try {
      await axiosInstance.delete(`/messages/${messageId}`, { params: scope === "me" ? { scope: "me" } : undefined });
    } catch (error) {
      set({ messages: previousMessages, pinnedMessages: previousPins });
      toast.error(error.response?.data?.message || "Could not delete message.");
    }
  },
  // Messages are end-to-end encrypted, so the server only holds ciphertext and can't search it.
  // Search the decrypted messages loaded on this device instead (synchronous, so no stale-response race).
  searchMessages: (query) => {
    const needle = query.trim().toLowerCase();
    const messageMatchIds = needle
      ? get().messages
        .filter((message) => !message.deleted && message.decryptStatus === "decrypted" && message.displayText?.toLowerCase().includes(needle))
        .map((message) => message._id)
      : [];
    set({ messageSearch: query, matchIndex: 0, messageMatchIds });
    if (messageMatchIds.length) {
      requestAnimationFrame(() => document.getElementById(`msg-${messageMatchIds[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  },
  goToMatch: (direction = 1) => {
    const ids = get().messageMatchIds;
    if (!ids.length) return;
    const next = (get().matchIndex + direction + ids.length) % ids.length;
    set({ matchIndex: next });
    document.getElementById(`msg-${ids[next]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  pruneExpired: () => set((state) => {
    const now = Date.now();
    const messages = state.messages.filter((message) => !message.expiresAt || new Date(message.expiresAt).getTime() > now);
    // Returning the same state skips a re-render of every bubble when nothing expired.
    return messages.length === state.messages.length ? state : { messages };
  }),
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
      rejected: conversation.status === "declined" ? state.rejected : state.rejected.filter((item) => !idsEqual(item._id, conversation._id)),
      conversationStatus: open ? conversation.status : state.conversationStatus,
      conversationInitiatedBy: open ? (conversation.initiatedBy?._id || conversation.initiatedBy) : state.conversationInitiatedBy,
      openConversationId: open ? conversation._id : state.openConversationId,
      activeTab: conversation.status === "accepted" ? "chats" : state.activeTab,
      editingMessage: open && conversation.status !== "accepted" ? null : state.editingMessage,
      replyingTo: open && conversation.status !== "accepted" ? null : state.replyingTo,
    }));
    if (conversation.status === "accepted" || conversation.status === "declined") {
      get().getChats({ force: true });
      get().getRejected({ force: true });
    }
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
      const mine = idsEqual(message.senderId, me?._id);
      // Tell the sender it reached this device (double grey tick), whether or not the chat is open.
      if (!mine && message.kind !== "system" && !message.delivered) socket.emit("messagesDelivered", { messageIds: [String(message._id)] });
      if (hasMessage(get().messages, message._id)) return;
      const inView = selected && (idsEqual(message.senderId, selected._id) || (mine && idsEqual(message.receiverId, selected._id)));
      if (inView) {
        if (!mine) socket.emit("markSeen", { peerId: message.senderId });
        const selectedId = selected._id;
        const pendingIndex = get().messages.findIndex((item) => item.pending && idsEqual(item.senderId, message.senderId));
        if (pendingIndex < 0) {
          const stub = asPendingMessage(message);
          set((state) => {
            if (hasMessage(state.messages, message._id)) return state;
            return { messages: [...state.messages, stub] };
          });
        }
        const hydrated = withEarlyReceipts(await hydrate(message, selected));
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
        recentChats.delete(String(message.senderId));
        const known = get().chatList.some((chat) => idsEqual(chat.user?._id, message.senderId));
        set((state) => ({
          chatList: sortChats(state.chatList.map((chat) => idsEqual(chat.user?._id, message.senderId)
            ? { ...chat, unreadCount: (chat.unreadCount || 0) + 1, updatedAt: message.createdAt, lastMessage: { _id: message._id, createdAt: message.createdAt, locked: chat.locked, stale: true }, lastPreview: chat.locked ? "🔒 New message" : "New message" }
            : chat)),
        }));
        // A chat you deleted (or a brand-new one) isn't in the list yet; refresh it.
        if (!known) get().getChats({ force: true });
        const chat = get().chatList.find((item) => idsEqual(item.user?._id, message.senderId));
        if (!chat?.muted) notifyIncomingMessage({ title: "New message", body: "You have a new message", tag: String(message._id) });
      }
    });
    const applyReceipt = (messageIds = [], patch) => {
      const ids = new Set(messageIds.map(String));
      const present = new Set(get().messages.map((message) => String(message._id)));
      ids.forEach((id) => { if (!present.has(id)) rememberReceipt(id, patch); });
      set((state) => ({ messages: state.messages.map((message) => ids.has(String(message._id)) ? { ...message, ...patch } : message) }));
    };
    // ✓ sent → ✓✓ delivered (reached their device) → blue ✓✓ seen
    socket.off("messagesDelivered").on("messagesDelivered", ({ messageIds }) => applyReceipt(messageIds, { delivered: true }));
    socket.off("messagesSeen").on("messagesSeen", ({ messageIds }) => applyReceipt(messageIds, { delivered: true, seen: true }));
    socket.off("messageEdited").on("messageEdited", async (message) => {
      if (!get().messages.some((item) => idsEqual(item._id, message._id))) return;
      const peer = get().selectedUser;
      const updated = await hydrate(message, peer);
      if (get().selectedUser?._id !== peer?._id) return;
      set((state) => ({ messages: state.messages.map((item) => idsEqual(item._id, message._id) ? { ...updated, replyPreview: item.replyPreview } : item) }));
    });
    socket.off("messageDeleted").on("messageDeleted", ({ _id }) => set((state) => ({
      messages: state.messages.map((message) => idsEqual(message._id, _id) ? { ...message, deleted: true, text: "", image: "", attachment: null, displayText: "", replyPreview: null } : message),
      pinnedMessages: state.pinnedMessages.filter((pin) => !idsEqual(pin.messageId, _id)),
    })));
    socket.off("messageHidden").on("messageHidden", ({ _id }) => set((state) => ({
      messages: state.messages.filter((message) => !idsEqual(message._id, _id)),
      pinnedMessages: state.pinnedMessages.filter((pin) => !idsEqual(pin.messageId, _id)),
    })));
    socket.off("conversationPinsUpdated").on("conversationPinsUpdated", async (payload) => {
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      if (!idsEqual(openId, payload?.conversationId)) return;
      const peer = get().selectedUser;
      const pins = await hydratePins(payload.pinnedMessages, peer);
      if (!idsEqual(get().selectedUser?._id, peer?._id)) return;
      set({ pinnedMessages: pins });
    });
    socket.off("userLastSeen").on("userLastSeen", ({ userId, lastSeen }) => set((state) => ({
      selectedUser: state.selectedUser && idsEqual(state.selectedUser._id, userId) ? { ...state.selectedUser, lastSeen } : state.selectedUser,
      chatList: state.chatList.map((chat) => idsEqual(chat.user?._id, userId) ? { ...chat, user: { ...chat.user, lastSeen } } : chat),
    })));
    socket.off("typing").on("typing", ({ from, activity }) => { if (idsEqual(from, get().selectedUser?._id)) set({ typing: activity === "recording" ? "recording" : "typing" }); });
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
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      if (!idsEqual(openId, payload.conversationId || payload.memory.conversationId)) return;
      set((state) => ({ memories: [payload.memory, ...state.memories.filter((item) => !idsEqual(item._id, payload.memory._id))] }));
    });
    socket.off("conversationMemoryDeleted").on("conversationMemoryDeleted", (payload) => {
      if (!payload?.memoryId) return;
      set((state) => ({ memories: state.memories.filter((item) => !idsEqual(item._id, payload.memoryId)) }));
    });
    socket.off("conversationCleared").on("conversationCleared", (payload) => {
      if (!payload?.conversationId) return;
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      const peer = get().chatList.find((chat) => idsEqual(chat._id, payload.conversationId))?.user;
      if (peer) {
        recentChats.delete(String(peer._id));
        cacheEncryptedMessages(peer._id, []).catch(() => {});
      }
      set((state) => ({ chatList: state.chatList.filter((chat) => !idsEqual(chat._id, payload.conversationId)) }));
      if (idsEqual(openId, payload.conversationId)) get().closeConversation();
    });
    socket.off("ritualUpdated").on("ritualUpdated", (payload) => {
      const openId = conversationIdForUser(get(), get().selectedUser?._id);
      if (!idsEqual(openId, payload?.conversationId)) return;
      set({ rituals: payload.rituals || [] });
    });
  },
  unsubscribeFromMessages: () => ["newMessage", "messagesSeen", "messageEdited", "messageDeleted", "typing", "stopTyping", "conversationRequest", "conversationUpdated", "conversationMoodUpdated", "conversationVibeUpdated", "conversationMetaUpdated", "conversationModeUpdated", "conversationStatusUpdated", "messageReactionAdded", "messageReactionUpdated", "messageReactionRemoved", "conversationMemoryCreated", "conversationMemoryDeleted", "ritualUpdated", "messageHidden", "conversationPinsUpdated", "userLastSeen", "conversationCleared", "messagesDelivered"].forEach((event) => useAuth.getState().socket?.off(event)),
  resetChatState: () => {
    get().unsubscribeFromMessages();
    recentChats.clear();
    inflight.clear();
    fetchedAt.clear();
    clearDecryptCache();
    set({ ...chatSessionState, loadToken: get().loadToken + 1 });
  },
  closeConversation: () => {
    const leaving = get();
    if (leaving.selectedUser && !leaving.conversationLocked) rememberChat(leaving.selectedUser._id, leaving.messages, leaving.hasMore);
    set({
      unlockTokens: relockedTokens(leaving, conversationIdForUser(leaving, leaving.selectedUser?._id)),
      lockGate: false,
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
      pinnedMessages: [],
      viewer: null,
      forwarding: null,
    });
    useConversationThemeStore.getState().clearConversationMood();
  },
  setSelectedUser: (selectedUser) => {
    const currentId = get().selectedUser?._id;
    if (!selectedUser || (currentId && String(currentId) === String(selectedUser._id))) {
      get().closeConversation();
      return;
    }
    const leaving = get();
    if (leaving.selectedUser && !leaving.conversationLocked) rememberChat(leaving.selectedUser._id, leaving.messages, leaving.hasMore);
    const leavingTokens = relockedTokens(leaving, conversationIdForUser(leaving, leaving.selectedUser?._id));
    const match = get().chatList.find((chat) => String(chat.user?._id) === String(selectedUser._id))
      || get().requests.find((request) => String(request.user?._id) === String(selectedUser._id))
      || get().rejected.find((item) => String(item.user?._id) === String(selectedUser._id));
    set({
      selectedUser: {
        ...selectedUser,
        encryptionPublicKey: selectedUser.encryptionPublicKey || match?.user?.encryptionPublicKey,
      },
      conversationVibe: match?.conversationVibe || "neutral",
      relationshipType: match?.relationshipType || "",
      relationshipCustom: "",
      conversationStatus: match?.status || null,
      conversationInitiatedBy: match?.initiatedBy?._id || match?.initiatedBy || null,
      openConversationId: match?._id || null,
      myMode: null,
      theirMode: null,
      appearance: { wallpaper: "default", bubbleStyle: "classic" },
      conversationLocked: Boolean(match?.locked),
      unlockTokens: leavingTokens,
      lockGate: false,
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
      pinnedMessages: [],
      viewer: null,
      forwarding: null,
    });
  },
  getConversationDetails: async () => {
    const { selectedUser } = get();
    const conversationId = conversationIdForUser(get(), selectedUser?._id);
    if (!conversationId) return set({ conversationVibe: "neutral", relationshipType: "", relationshipCustom: "" });
    try {
      const { data } = await axiosInstance.get(`/messages/conversation/${conversationId}`, { headers: unlockHeaderFor(get(), conversationId) });
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
      const pins = await hydratePins(data.pinnedMessages, get().selectedUser);
      if (get().selectedUser?._id === selectedUser._id) set({ pinnedMessages: pins });
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
      set((state) => ({
        relationshipType: data.relationshipType || "",
        relationshipCustom: data.relationshipCustom || "",
        appearance: data.appearance || state.appearance,
        conversationLocked: Boolean(data.locked),
        defaultDisappearing: Boolean(data.defaultDisappearing),
        chatList: state.chatList.map((chat) => idsEqual(chat._id, conversationId) ? { ...chat, locked: Boolean(data.locked) } : chat),
      }));
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update conversation.");
      return false;
    }
  },
  // ---- Chat lock -------------------------------------------------------------------------
  setChatLockPin: async ({ pin, currentPin, password }) => {
    try {
      await axiosInstance.put("/messages/lock/pin", { pin, currentPin, password });
      const authUser = useAuth.getState().authUser;
      if (authUser) useAuth.setState({ authUser: { ...authUser, hasChatLockPin: true } });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.response?.data?.message || "Could not save the PIN." };
    }
  },
  unlockChat: async (pin) => {
    const { selectedUser } = get();
    const conversationId = conversationIdForUser(get(), selectedUser?._id);
    if (!selectedUser || !conversationId) return { ok: false, message: "Chat not found." };
    try {
      const { data } = await axiosInstance.post(`/messages/conversation/${conversationId}/unlock`, { pin });
      if (!idsEqual(get().selectedUser?._id, selectedUser._id)) return { ok: true };
      set((state) => ({
        lockGate: false,
        unlockTokens: data.token ? { ...state.unlockTokens, [String(conversationId)]: { token: data.token, expiresAt: data.expiresAt } } : state.unlockTokens,
      }));
      get().getConversationDetails();
      get().getMessages(selectedUser._id);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.response?.data?.message || "Could not unlock this chat." };
    }
  },
  lockChat: async () => {
    const peerId = get().selectedUser?._id;
    const conversationId = conversationIdForUser(get(), peerId);
    const ok = await get().patchConversationMeta({ locked: true });
    if (!ok) return false;
    recentChats.delete(String(peerId));
    cacheEncryptedMessages(peerId, []).catch(() => {});
    // Hide the preview immediately; the server only sends "locked" for this chat from now on.
    set((state) => ({
      unlockTokens: relockedTokens(state, conversationId),
      chatList: state.chatList.map((chat) => idsEqual(chat._id, conversationId)
        ? { ...chat, locked: true, lastPreview: "🔒 Locked chat", lastMessage: chat.lastMessage ? { ...chat.lastMessage, locked: true } : chat.lastMessage }
        : chat),
    }));
    get().closeConversation();
    toast.success("Chat locked. You'll need your PIN to open it.");
    return true;
  },
  removeChatLock: async (pin) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return { ok: false, message: "Chat not found." };
    try {
      const { data } = await axiosInstance.patch(`/messages/conversation/${conversationId}/meta`, { locked: false, pin });
      set((state) => ({
        conversationLocked: Boolean(data.locked),
        chatList: state.chatList.map((chat) => idsEqual(chat._id, conversationId) ? { ...chat, locked: false } : chat),
      }));
      toast.success("Chat lock removed");
      get().getChats({ force: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.response?.data?.message || "Could not remove the lock." };
    }
  },
  // ---- Delete chat (for me) --------------------------------------------------------------
  deleteChat: async () => {
    const peer = get().selectedUser;
    const conversationId = conversationIdForUser(get(), peer?._id);
    if (!peer) return false;
    if (!conversationId) {
      get().closeConversation();
      return true;
    }
    try {
      await axiosInstance.delete(`/messages/conversation/${conversationId}`, { headers: unlockHeaderFor(get(), conversationId) });
      recentChats.delete(String(peer._id));
      cacheEncryptedMessages(peer._id, []).catch(() => {});
      get().setDraft(peer._id, "");
      set((state) => ({ chatList: state.chatList.filter((chat) => !idsEqual(chat._id, conversationId)), messages: [] }));
      get().closeConversation();
      toast.success(`Chat with ${peer.fullName} deleted`);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete this chat.");
      return false;
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
      const { data } = await axiosInstance.get(`/messages/conversation/${conversationId}/memories`, { headers: unlockHeaderFor(get(), conversationId) });
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
      set((state) => ({ memories: [data, ...state.memories.filter((item) => !idsEqual(item._id, data._id))] }));
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
  openViewer: (viewer) => set({ viewer }),
  closeViewer: () => set({ viewer: null }),
  queueAttachment: (queuedFile) => set({ queuedFile }),
  clearQueuedFile: () => set({ queuedFile: null }),
  setForwarding: (forwarding) => set({ forwarding }),
  pinMessage: async (messageId) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    try {
      const { data } = await axiosInstance.put(`/messages/conversation/${conversationId}/pins/${messageId}`);
      set({ pinnedMessages: await hydratePins(data.pinnedMessages, get().selectedUser) });
      toast.success("Message pinned");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not pin message.");
    }
  },
  unpinMessage: async (messageId) => {
    const conversationId = conversationIdForUser(get(), get().selectedUser?._id);
    if (!conversationId) return;
    const previous = get().pinnedMessages;
    set({ pinnedMessages: previous.filter((pin) => !idsEqual(pin.messageId, messageId)) });
    try {
      await axiosInstance.delete(`/messages/conversation/${conversationId}/pins/${messageId}`);
    } catch (error) {
      set({ pinnedMessages: previous });
      toast.error(error.response?.data?.message || "Could not unpin message.");
    }
  },
  // Text is re-encrypted for each recipient on this device; media is copied server-side.
  forwardMessage: async (message, targets) => {
    const me = useAuth.getState().authUser;
    let sent = 0;
    for (const target of targets) {
      try {
        const peerPublic = resolveConversationPeerKey(me, target, listedPeerFor(get(), target._id));
        const text = message.displayText
          ? await encryptText(message.displayText, me, { ...target, encryptionPublicKey: peerPublic || target.encryptionPublicKey })
          : "";
        await axiosInstance.post(`/messages/send/${target._id}`, { text, forwardOf: message._id });
        sent += 1;
      } catch (error) {
        toast.error(`${target.fullName}: ${sendFailureMessage(error)}`);
      }
    }
    if (sent) {
      toast.success(sent === 1 ? `Forwarded to ${targets[0].fullName}` : `Forwarded to ${sent} chats`);
      get().getChats();
    }
    return sent;
  },
  setBlocked: async (userId, blocked) => {
    try {
      const { data } = await axiosInstance.put(`/messages/block/${userId}`, { blocked });
      const authUser = useAuth.getState().authUser;
      if (authUser) useAuth.setState({ authUser: { ...authUser, blockedUsers: data.blockedUsers || [] } });
      toast.success(blocked ? "Contact blocked" : "Contact unblocked");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update block.");
    }
  },
  // Unlock header for a chat that's currently open and unlocked (used by the contact profile).
  getUnlockHeaders: (userId) => unlockHeaderFor(get(), conversationIdForUser(get(), userId)),
  setDraft: (userId, text) => {
    if (!userId) return;
    set((state) => {
      const key = String(userId);
      if ((state.drafts[key] || "") === text) return state;
      const drafts = { ...state.drafts };
      if (text) drafts[key] = text;
      else delete drafts[key];
      return { drafts };
    });
  },
}));
