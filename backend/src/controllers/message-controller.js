import cloudinary from "../lib/cloudinary.js";
import Conversation from "../models/conversation-model.js";
import Message from "../models/message-model.js";
import User from "../models/user-model.js";
import { emitToUser } from "../lib/socket.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireObjectId, sanitizeQuery, validateExpiresAt, validateImageDataUrl, validateMessageText } from "../lib/validate.js";

export const ALLOWED_MOODS = ["happy", "angry", "calm", "sad", "professional", "excited", "sleepy", "romantic"];
export const ALLOWED_VIBES = ["neutral", "happy", "angry", "sad", "romantic", "playful", "excited", "calm", "focused", "celebration"];

const publicUser = "-password";
const pairQuery = (firstId, secondId) => ({ participants: { $all: [firstId, secondId], $size: 2 } });

const otherParticipant = (conversation, myId) =>
  conversation.participants.find((participant) => participant._id.toString() !== myId.toString());

const serializeUserMood = (user) => {
  if (!user?.mood) return null;
  return { mood: user.mood, updatedAt: user.moodUpdatedAt };
};

const moodFromConversationMap = (conversation, userId) => {
  if (!userId || !conversation?.moods) return null;
  const entry = typeof conversation.moods.get === "function"
    ? conversation.moods.get(String(userId))
    : conversation.moods[String(userId)];
  if (!entry?.mood) return null;
  return { mood: entry.mood, updatedAt: entry.updatedAt };
};

const participantId = (participant) => (participant?._id ?? participant).toString();

const isMuted = (conversation, userId) =>
  Boolean(conversation.mutedBy?.some((id) => String(id) === String(userId)));

const moodPayload = async (conversation, myId) => {
  const otherId = conversation
    ? conversation.participants.find((participant) => participantId(participant) !== myId.toString())
    : null;
  const [me, other] = await Promise.all([
    User.findById(myId).select("mood moodUpdatedAt"),
    otherId ? User.findById(otherId).select("mood moodUpdatedAt") : null,
  ]);
  return {
    mine: serializeUserMood(me) || moodFromConversationMap(conversation, myId),
    theirs: serializeUserMood(other) || moodFromConversationMap(conversation, otherId),
    conversationId: conversation?._id || null,
    muted: conversation ? isMuted(conversation, myId) : false,
  };
};

const emitMoodToPeers = async (userId, payload) => {
  const conversations = await Conversation.find({ participants: userId }).select("participants");
  const peerIds = new Set();
  conversations.forEach((conversation) => {
    conversation.participants.forEach((participant) => {
      const id = participantId(participant);
      if (id !== String(userId)) peerIds.add(id);
    });
  });
  peerIds.forEach((peerId) => emitToUser(peerId, "conversationMoodUpdated", payload));
};

const findPairConversation = async (myId, otherUserId) => {
  requireObjectId(otherUserId, "user id");
  if (otherUserId === myId.toString()) throw new AppError(400, "Invalid conversation.");
  return Conversation.findOne(pairQuery(myId, otherUserId));
};

export const searchUsers = asyncHandler(async (req, res) => {
  const query = sanitizeQuery(req.query.q, 60);
  if (!query) return res.status(200).json([]);
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const users = await User.find({
    _id: { $ne: req.user._id },
    $or: [{ fullName: expression }, { username: expression }],
  }).select(publicUser).limit(20);
  res.status(200).json(users);
});

export const getUsersForSidebar = asyncHandler(async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user._id } }).select(publicUser).limit(100);
  res.status(200).json(users);
});

export const getMessages = asyncHandler(async (req, res) => {
  requireObjectId(req.params.id, "user id");
  const conversation = await Conversation.findOne(pairQuery(req.user._id, req.params.id));
  if (!conversation) return res.status(200).json({ messages: [], hasMore: false });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const filter = { conversationId: conversation._id };
  if (req.query.before) {
    requireObjectId(req.query.before, "cursor");
    const cursor = await Message.findOne({ _id: req.query.before, conversationId: conversation._id }).select("createdAt");
    if (!cursor) throw new AppError(400, "Invalid cursor.");
    filter.createdAt = { $lt: cursor.createdAt };
  } else {
    const unseen = await Message.find({
      conversationId: conversation._id,
      receiverId: req.user._id,
      seen: false,
      deleted: false,
    }).select("_id senderId");
    if (unseen.length) {
      await Message.updateMany({ _id: { $in: unseen.map((message) => message._id) } }, { $set: { seen: true } });
      const bySender = new Map();
      unseen.forEach((message) => {
        const key = message.senderId.toString();
        if (!bySender.has(key)) bySender.set(key, []);
        bySender.get(key).push(message._id.toString());
      });
      bySender.forEach((messageIds, senderId) => {
        emitToUser(senderId, "messagesSeen", { conversationId: conversation._id, messageIds });
      });
    }
  }

  const page = await Message.find(filter)
    .populate("replyTo", "senderId text image deleted")
    .sort({ createdAt: -1 })
    .limit(limit + 1);
  const hasMore = page.length > limit;
  const messages = page.slice(0, limit).reverse();
  res.status(200).json({ messages, hasMore });
});

export const searchConversationMessages = asyncHandler(async (req, res) => {
  const query = sanitizeQuery(req.query.q, 80);
  requireObjectId(req.params.conversationId, "user id");
  const conversation = await Conversation.findOne(pairQuery(req.user._id, req.params.conversationId));
  if (!conversation || !query) return res.status(200).json([]);
  const messages = await Message.find({
    conversationId: conversation._id,
    deleted: false,
    $text: { $search: query },
  }, { score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" }, createdAt: 1 }).limit(50);
  res.status(200).json(messages);
});

export const sendMessage = asyncHandler(async (req, res) => {
  const text = validateMessageText(req.body.text || "");
  const image = validateImageDataUrl(req.body.image);
  const expiry = validateExpiresAt(req.body.expiresAt);
  const senderId = req.user._id;
  const receiverId = requireObjectId(req.params.id, "user id");
  if (!text && !image) throw new AppError(400, "Message text or image is required.");
  if (senderId.toString() === receiverId) throw new AppError(400, "You cannot message yourself.");
  if (!(await User.exists({ _id: receiverId }))) throw new AppError(404, "User not found.");

  let imageUrl = "";
  if (image) {
    try {
      const upload = await cloudinary.uploader.upload(image, { folder: "chat-images", resource_type: "image" });
      imageUrl = upload.secure_url;
    } catch (error) {
      logger.error("Cloudinary upload failed:", error.message);
      throw new AppError(400, "Image upload failed.");
    }
  }

  let conversation = await Conversation.findOne(pairQuery(senderId, receiverId));
  let createdRequest = false;
  if (!conversation) {
    conversation = await Conversation.create({ participants: [senderId, receiverId], initiatedBy: senderId, status: "pending" });
    createdRequest = true;
  } else if (conversation.status === "declined") {
    conversation.status = "pending";
    conversation.initiatedBy = senderId;
    conversation.acceptedAt = undefined;
    createdRequest = true;
  }

  let replyToId = null;
  if (req.body.replyTo) {
    requireObjectId(req.body.replyTo, "reply id");
    const original = await Message.findOne({ _id: req.body.replyTo, conversationId: conversation._id });
    if (original) replyToId = original._id;
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId,
    receiverId,
    text,
    image: imageUrl,
    expiresAt: expiry,
    replyTo: replyToId,
  });
  conversation.lastMessage = message._id;
  await conversation.save();
  const populated = await Message.findById(message._id).populate("replyTo", "senderId text image deleted");

  if (conversation.status === "accepted") {
    emitToUser(receiverId, "newMessage", populated);
    emitToUser(senderId, "newMessage", populated);
  }
  if (createdRequest) {
    const request = await Conversation.findById(conversation._id)
      .populate("initiatedBy", publicUser)
      .populate("participants", publicUser)
      .populate("lastMessage");
    emitToUser(receiverId, "conversationRequest", request);
  }
  res.status(201).json(populated);
});

const ownedMessage = async (req) => {
  requireObjectId(req.params.messageId, "message id");
  const message = await Message.findOne({ _id: req.params.messageId, senderId: req.user._id });
  if (!message) throw new AppError(404, "Message not found or not owned by you.");
  return message;
};

export const editMessage = asyncHandler(async (req, res) => {
  const message = await ownedMessage(req);
  if (message.deleted) throw new AppError(400, "Deleted messages cannot be edited.");
  const text = validateMessageText(req.body.text || "");
  if (!text) throw new AppError(400, "Message text is required.");
  message.text = text;
  message.edited = true;
  await message.save();
  emitToUser(message.receiverId, "messageEdited", message);
  emitToUser(message.senderId, "messageEdited", message);
  res.status(200).json(message);
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const message = await ownedMessage(req);
  if (message.deleted) throw new AppError(400, "Message is already deleted.");
  message.deleted = true;
  message.text = "";
  message.image = "";
  await message.save();
  const payload = { _id: message._id, conversationId: message.conversationId };
  emitToUser(message.receiverId, "messageDeleted", payload);
  emitToUser(message.senderId, "messageDeleted", payload);
  res.status(200).json(message);
});

export const getChats = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ participants: req.user._id, status: "accepted" })
    .populate("participants", publicUser).populate("lastMessage").sort({ updatedAt: -1 }).limit(200);
  const unread = await Message.aggregate([
    { $match: { conversationId: { $in: conversations.map((item) => item._id) }, receiverId: req.user._id, seen: false, deleted: false } },
    { $group: { _id: "$conversationId", count: { $sum: 1 } } },
  ]);
  const unreadByConversation = Object.fromEntries(unread.map((item) => [item._id.toString(), item.count]));
  res.status(200).json(conversations.map((conversation) => ({
    _id: conversation._id,
    user: otherParticipant(conversation, req.user._id),
    lastMessage: conversation.lastMessage,
    updatedAt: conversation.updatedAt,
    unreadCount: unreadByConversation[conversation._id.toString()] || 0,
    muted: isMuted(conversation, req.user._id),
    conversationVibe: ALLOWED_VIBES.includes(conversation.conversationVibe) ? conversation.conversationVibe : "neutral",
  })));
});

export const getRequests = asyncHandler(async (req, res) => {
  const requests = await Conversation.find({ participants: req.user._id, initiatedBy: { $ne: req.user._id }, status: "pending" })
    .populate("participants", publicUser).populate("initiatedBy", publicUser).populate("lastMessage").sort({ updatedAt: -1 });
  res.status(200).json(requests.map((conversation) => ({ ...conversation.toObject(), user: otherParticipant(conversation, req.user._id) })));
});

const respondToRequest = async (req, res, status) => {
  requireObjectId(req.params.id, "request id");
  const conversation = await Conversation.findOne({ _id: req.params.id, participants: req.user._id, initiatedBy: { $ne: req.user._id }, status: "pending" });
  if (!conversation) throw new AppError(404, "Pending request not found.");
  conversation.status = status;
  if (status === "accepted") conversation.acceptedAt = new Date();
  await conversation.save();
  const populated = await Conversation.findById(conversation._id).populate("participants", publicUser).populate("initiatedBy", publicUser).populate("lastMessage");
  const initiator = otherParticipant(populated, req.user._id);
  emitToUser(initiator._id, "conversationUpdated", populated);
  emitToUser(req.user._id, "conversationUpdated", populated);
  res.status(200).json(populated);
};

export const acceptRequest = asyncHandler((req, res) => respondToRequest(req, res, "accepted"));
export const rejectRequest = asyncHandler((req, res) => respondToRequest(req, res, "declined"));

export const getConversationMood = asyncHandler(async (req, res) => {
  requireObjectId(req.params.userId, "user id");
  const conversation = await findPairConversation(req.user._id, req.params.userId);
  if (!conversation) {
    const [me, other] = await Promise.all([
      User.findById(req.user._id).select("mood moodUpdatedAt"),
      User.findById(req.params.userId).select("mood moodUpdatedAt"),
    ]);
    return res.status(200).json({
      mine: serializeUserMood(me),
      theirs: serializeUserMood(other),
      conversationId: null,
      muted: false,
    });
  }
  res.status(200).json(await moodPayload(conversation, req.user._id));
});

export const updateConversationMood = asyncHandler(async (req, res) => {
  const mood = (req.body.mood || "").trim().toLowerCase();
  if (!ALLOWED_MOODS.includes(mood)) throw new AppError(400, "Invalid mood.");
  const conversation = await findPairConversation(req.user._id, req.params.userId);
  const updatedAt = new Date();
  await User.findByIdAndUpdate(req.user._id, { mood, moodUpdatedAt: updatedAt });
  await emitMoodToPeers(req.user._id, {
    userId: req.user._id,
    mood,
    updatedAt,
    conversationId: conversation?._id || null,
  });
  if (!conversation) {
    const other = await User.findById(req.params.userId).select("mood moodUpdatedAt");
    return res.status(200).json({
      mine: { mood, updatedAt },
      theirs: serializeUserMood(other),
      conversationId: null,
      muted: false,
    });
  }
  res.status(200).json(await moodPayload(conversation, req.user._id));
});

const serializeConversation = (conversation) => ({
  _id: conversation._id,
  participants: conversation.participants,
  conversationVibe: ALLOWED_VIBES.includes(conversation.conversationVibe) ? conversation.conversationVibe : "neutral",
  status: conversation.status,
  lastMessage: conversation.lastMessage,
});

const loadParticipantConversation = async (conversationId, userId) => {
  requireObjectId(conversationId, "conversation id");
  const conversation = await Conversation.findById(conversationId)
    .populate("participants", publicUser)
    .populate("lastMessage");
  if (!conversation) throw new AppError(404, "Conversation not found.");
  if (!conversation.participants.some((participant) => participantId(participant) === String(userId))) {
    throw new AppError(403, "You are not part of this conversation.");
  }
  return conversation;
};

export const getConversationDetails = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  res.status(200).json(serializeConversation(conversation));
});

export const updateConversationVibe = asyncHandler(async (req, res) => {
  const key = (req.body.key || "").trim().toLowerCase();
  if (!ALLOWED_VIBES.includes(key)) throw new AppError(400, "Invalid conversation vibe.");
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  conversation.conversationVibe = key;
  await conversation.save();
  const populated = await Conversation.findById(conversation._id)
    .populate("participants", publicUser)
    .populate("lastMessage");
  const payload = serializeConversation(populated);
  populated.participants.forEach((participant) => {
    if (String(participant._id) === String(req.user._id)) return;
    emitToUser(participant._id, "conversationVibeUpdated", {
      conversationId: populated._id,
      conversationVibe: payload.conversationVibe,
      changedBy: req.user._id,
    });
  });
  res.status(200).json(payload);
});

export const updateConversationMute = asyncHandler(async (req, res) => {
  const muted = Boolean(req.body.muted);
  const conversation = await findPairConversation(req.user._id, req.params.userId);
  if (!conversation) throw new AppError(404, "Conversation not found.");
  const myId = req.user._id.toString();
  conversation.mutedBy = conversation.mutedBy || [];
  const already = conversation.mutedBy.some((id) => String(id) === myId);
  if (muted && !already) conversation.mutedBy.push(req.user._id);
  if (!muted) conversation.mutedBy = conversation.mutedBy.filter((id) => String(id) !== myId);
  await conversation.save();
  res.status(200).json(await moodPayload(conversation, req.user._id));
});
