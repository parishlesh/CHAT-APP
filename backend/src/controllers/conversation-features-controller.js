import Conversation from "../models/conversation-model.js";
import Memory from "../models/memory-model.js";
import Message from "../models/message-model.js";
import User from "../models/user-model.js";
import { emitToUser } from "../lib/socket.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import {
  AVAILABILITY_KEYS, CONVERSATION_MODES, MEMORY_TYPES, RELATIONSHIP_TYPES,
  RITUAL_KEYS, WALLPAPERS, BUBBLE_STYLES,
} from "../lib/catalog.js";
import { loadParticipantConversation, serializeConversation, participantId } from "./message-controller.js";
import { requireObjectId } from "../lib/validate.js";

const emitToOthers = (conversation, myId, event, payload) => {
  conversation.participants.forEach((participant) => {
    const id = participantId(participant);
    if (id === String(myId)) return;
    emitToUser(id, event, payload);
  });
};

const reload = (id, myId) => loadParticipantConversation(id, myId).then((conversation) => serializeConversation(conversation, myId));

export const patchConversationMeta = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  const { relationshipType, relationshipCustom, appearance, locked, defaultDisappearing } = req.body;
  if (relationshipType !== undefined) {
    const key = String(relationshipType || "").trim().toLowerCase();
    if (key && !RELATIONSHIP_TYPES.includes(key)) throw new AppError(400, "Invalid relationship type.");
    conversation.relationshipType = key;
    if (key === "custom") conversation.relationshipCustom = String(relationshipCustom || "").trim().slice(0, 40);
    else conversation.relationshipCustom = "";
  }
  if (appearance) {
    if (appearance.wallpaper && !WALLPAPERS.includes(appearance.wallpaper)) throw new AppError(400, "Invalid wallpaper.");
    if (appearance.bubbleStyle && !BUBBLE_STYLES.includes(appearance.bubbleStyle)) throw new AppError(400, "Invalid bubble style.");
    conversation.appearance = {
      wallpaper: appearance.wallpaper || conversation.appearance?.wallpaper || "default",
      bubbleStyle: appearance.bubbleStyle || conversation.appearance?.bubbleStyle || "classic",
    };
  }
  if (typeof locked === "boolean") {
    conversation.lockedBy = conversation.lockedBy || [];
    const mine = conversation.lockedBy.some((id) => String(id) === String(req.user._id));
    if (locked && !mine) conversation.lockedBy.push(req.user._id);
    if (!locked) conversation.lockedBy = conversation.lockedBy.filter((id) => String(id) !== String(req.user._id));
  }
  if (typeof defaultDisappearing === "boolean") conversation.defaultDisappearing = defaultDisappearing;
  await conversation.save();
  const payload = await reload(conversation._id, req.user._id);
  emitToOthers(conversation, req.user._id, "conversationMetaUpdated", { conversationId: conversation._id, ...payload, changedBy: req.user._id });
  res.status(200).json(payload);
});

export const updateParticipantMode = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  const key = req.body.key == null || req.body.key === "" ? null : String(req.body.key).trim().toLowerCase();
  if (key && !CONVERSATION_MODES.includes(key)) throw new AppError(400, "Invalid mode.");
  const expiresAt = req.body.until ? new Date(req.body.until) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new AppError(400, "Invalid expiration.");
  conversation.participantModes = (conversation.participantModes || []).filter((mode) => String(mode.userId) !== String(req.user._id));
  if (key) conversation.participantModes.push({ userId: req.user._id, key, updatedAt: new Date(), expiresAt });
  await conversation.save();
  const payload = await reload(conversation._id, req.user._id);
  emitToOthers(conversation, req.user._id, "conversationModeUpdated", {
    conversationId: conversation._id,
    userId: req.user._id,
    myMode: payload.myMode,
    mode: key ? { userId: req.user._id, key, expiresAt } : null,
  });
  res.status(200).json(payload);
});

export const updateAvailability = asyncHandler(async (req, res) => {
  const key = req.body.key == null || req.body.key === "" ? "" : String(req.body.key).trim().toLowerCase();
  if (key && !AVAILABILITY_KEYS.includes(key)) throw new AppError(400, "Invalid availability.");
  const until = req.body.until ? new Date(req.body.until) : null;
  if (until && Number.isNaN(until.getTime())) throw new AppError(400, "Invalid until date.");
  const user = await User.findByIdAndUpdate(req.user._id, { availability: { key, until } }, { new: true }).select("-password");
  const conversations = await Conversation.find({ participants: req.user._id }).select("participants");
  conversations.forEach((conversation) => emitToOthers(conversation, req.user._id, "conversationStatusUpdated", {
    userId: req.user._id,
    availability: user.availability,
  }));
  res.status(200).json({ availability: user.availability });
});

export const listMemories = asyncHandler(async (req, res) => {
  await loadParticipantConversation(req.params.conversationId, req.user._id);
  const memories = await Memory.find({ conversationId: req.params.conversationId }).sort({ createdAt: -1 }).limit(100);
  res.status(200).json(memories);
});

export const createMemory = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  requireObjectId(req.body.messageId, "message id");
  const message = await Message.findOne({ _id: req.body.messageId, conversationId: conversation._id });
  if (!message) throw new AppError(404, "Message not found in this conversation.");
  const title = String(req.body.title || "").trim();
  if (!title) throw new AppError(400, "Title is required.");
  const type = String(req.body.type || "memory").trim().toLowerCase();
  if (!MEMORY_TYPES.includes(type)) throw new AppError(400, "Invalid memory type.");
  const memory = await Memory.create({
    conversationId: conversation._id,
    createdBy: req.user._id,
    messageId: message._id,
    title: title.slice(0, 80),
    note: String(req.body.note || "").trim().slice(0, 280),
    type,
  });
  emitToOthers(conversation, req.user._id, "conversationMemoryCreated", { conversationId: conversation._id, memory });
  res.status(201).json(memory);
});

export const deleteMemory = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  requireObjectId(req.params.memoryId, "memory id");
  const memory = await Memory.findOneAndDelete({ _id: req.params.memoryId, conversationId: conversation._id });
  if (!memory) throw new AppError(404, "Memory not found.");
  emitToOthers(conversation, req.user._id, "conversationMemoryDeleted", { conversationId: conversation._id, memoryId: memory._id });
  res.status(200).json({ ok: true });
});

export const upsertRitual = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  const key = String(req.body.key || "").trim().toLowerCase();
  if (!RITUAL_KEYS.includes(key)) throw new AppError(400, "Invalid ritual.");
  const recurrence = req.body.recurrence === "weekly" ? "weekly" : "daily";
  conversation.rituals = conversation.rituals || [];
  const existing = conversation.rituals.find((ritual) => ritual.key === key);
  if (existing) {
    existing.recurrence = recurrence;
    existing.paused = Boolean(req.body.paused);
    if (req.body.prompted) existing.lastPromptedAt = new Date();
  } else {
    conversation.rituals.push({ key, recurrence, paused: false, createdBy: req.user._id });
  }
  await conversation.save();
  const payload = await reload(conversation._id, req.user._id);
  emitToOthers(conversation, req.user._id, "ritualUpdated", { conversationId: conversation._id, rituals: payload.rituals });
  res.status(200).json(payload);
});

export const deleteRitual = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  const key = String(req.params.key || "").trim().toLowerCase();
  conversation.rituals = (conversation.rituals || []).filter((ritual) => ritual.key !== key);
  await conversation.save();
  const payload = await reload(conversation._id, req.user._id);
  emitToOthers(conversation, req.user._id, "ritualUpdated", { conversationId: conversation._id, rituals: payload.rituals });
  res.status(200).json(payload);
});
