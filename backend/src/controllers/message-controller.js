import cloudinary from "../lib/cloudinary.js";
import Conversation from "../models/conversation-model.js";
import Message from "../models/message-model.js";
import User from "../models/user-model.js";
import { emitToUser } from "../lib/socket.js";
import { AppError, asyncHandler } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { requireObjectId, sanitizeQuery, validateExpiresAt, validateImageDataUrl, validateMessageText } from "../lib/validate.js";

import { ALLOWED_MOODS, ALLOWED_VIBES, REACTION_KEYS } from "../lib/catalog.js";
import { REQUEST_DECLINED_EVENT, REQUEST_DECLINED_TEXT, assertCanSendMessage, initiatorId, isRejectedParty, reachablePeerIds, statusAfterSend } from "../lib/conversation-access.js";
import { describeEncryptedText } from "../lib/envelope.js";
import { createUploadSignature, destroyAttachment, validateAttachment } from "../lib/media.js";
import { MAX_PINNED_MESSAGES } from "../lib/catalog.js";
import {
  assertUnlocked, clearedAtFor, hasValidUnlock, hashPin, isLockedFor, issueUnlockToken, pinMatches, validatePin,
} from "../lib/chat-lock.js";
import bcrypt from "bcryptjs";

const publicUser = "fullName username email profilePic about encryptionPublicKey mood moodUpdatedAt availability lastSeen";
const replyFields = "senderId text image attachment deleted";
const pinFields = "senderId text image attachment deleted deletedFor createdAt";

const hasBlocked = (user, otherId) => Boolean(user?.blockedUsers?.some((id) => String(id) === String(otherId)));
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
    User.findById(myId).select("mood moodUpdatedAt availability"),
    otherId ? User.findById(otherId).select("mood moodUpdatedAt availability") : null,
  ]);
  // Someone whose request was rejected doesn't get to see the other person's mood or status.
  const hidden = isRejectedParty(conversation, myId);
  return {
    mine: serializeUserMood(me) || moodFromConversationMap(conversation, myId),
    theirs: hidden ? null : (serializeUserMood(other) || moodFromConversationMap(conversation, otherId)),
    conversationId: conversation?._id || null,
    muted: conversation ? isMuted(conversation, myId) : false,
    mineAvailability: me?.availability || null,
    theirAvailability: hidden ? null : (other?.availability || null),
  };
};

const emitMoodToPeers = async (userId, payload) => {
  const conversations = await Conversation.find({ participants: userId }).select("participants status initiatedBy");
  reachablePeerIds(conversations, userId).forEach((peerId) => emitToUser(peerId, "conversationMoodUpdated", payload));
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

// Marks the other person's messages as read and tells them. Runs alongside the page query
// so opening a chat costs one round of database work instead of three in a row.
const markConversationSeen = async (conversation, userId) => {
  const unseen = await Message.find({
    conversationId: conversation._id,
    receiverId: userId,
    seen: false,
    deleted: false,
  }).select("_id senderId").lean();
  if (!unseen.length) return;
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
};

export const getMessages = asyncHandler(async (req, res) => {
  requireObjectId(req.params.id, "user id");
  const conversation = await Conversation.findOne(pairQuery(req.user._id, req.params.id));
  if (!conversation) return res.status(200).json({ messages: [], hasMore: false });
  assertUnlocked(req, conversation);

  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const filter = { conversationId: conversation._id, deletedFor: { $ne: req.user._id } };
  const createdAt = {};
  const cleared = clearedAtFor(conversation, req.user._id);
  if (cleared) createdAt.$gt = cleared;
  let seenWork = Promise.resolve();
  if (req.query.before) {
    requireObjectId(req.query.before, "cursor");
    const cursor = await Message.findOne({ _id: req.query.before, conversationId: conversation._id }).select("createdAt").lean();
    if (!cursor) throw new AppError(400, "Invalid cursor.");
    createdAt.$lt = cursor.createdAt;
  } else {
    seenWork = markConversationSeen(conversation, req.user._id);
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;

  const [page] = await Promise.all([
    Message.find(filter).populate("replyTo", replyFields).sort({ createdAt: -1 }).limit(limit + 1).lean(),
    seenWork,
  ]);
  const hasMore = page.length > limit;
  const messages = page.slice(0, limit).reverse();
  res.status(200).json({
    messages,
    hasMore,
    conversation: { _id: conversation._id, status: conversation.status, initiatedBy: initiatorId(conversation), locked: isLockedFor(conversation, req.user._id) },
  });
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
  let attachment = validateAttachment(req.body.attachment, { userId: req.user._id });
  const expiry = validateExpiresAt(req.body.expiresAt);
  const senderId = req.user._id;
  const receiverId = requireObjectId(req.params.id, "user id");
  const envelopePreview = describeEncryptedText(text);
  logger.info("[CHAT MESSAGE] HTTP request received", {
    senderId: String(senderId),
    recipientId: receiverId,
    conversationPeer: receiverId,
    encryptionVersion: envelopePreview.encryptionVersion,
    ciphertextLength: text.length,
    hasImage: Boolean(image),
  });
  if (senderId.toString() === receiverId) throw new AppError(400, "You cannot message yourself.");
  const receiver = await User.findById(receiverId).select("blockedUsers");
  if (!receiver) throw new AppError(404, "User not found.");
  if (hasBlocked(req.user, receiverId)) throw new AppError(403, "You blocked this contact. Unblock them to send a message.");
  // Don't reveal the block to the sender; just refuse delivery.
  if (hasBlocked(receiver, senderId)) throw new AppError(403, "This message couldn't be delivered.");

  // Forwarding reuses the original media server-side, after checking the forwarder could see it.
  let forwarded = false;
  let forwardedImage = "";
  if (req.body.forwardOf) {
    requireObjectId(req.body.forwardOf, "forwarded message id");
    const original = await Message.findOne({
      _id: req.body.forwardOf,
      $or: [{ senderId }, { receiverId: senderId }],
      deleted: false,
      deletedFor: { $ne: senderId },
      kind: "user",
    }).select("attachment image");
    if (!original) throw new AppError(404, "Message to forward wasn't found.");
    attachment = original.attachment?.url ? original.attachment.toObject() : null;
    forwarded = true;
    if (!attachment && original.image) forwardedImage = original.image;
  }
  if (!text && !image && !attachment && !forwardedImage) throw new AppError(400, "Message text or attachment is required.");

  let conversation = await Conversation.findOne(pairQuery(senderId, receiverId));
  // Check access before uploading, so blocked senders can't push images to Cloudinary.
  assertCanSendMessage(conversation, senderId);

  let imageUrl = forwardedImage;
  if (image) {
    try {
      const upload = await cloudinary.uploader.upload(image, { folder: "chat-images", resource_type: "image" });
      imageUrl = upload.secure_url;
    } catch (error) {
      logger.error("Cloudinary upload failed:", error.message);
      throw new AppError(400, "Image upload failed.");
    }
  }

  const transition = statusAfterSend(conversation, senderId);
  const createdRequest = Boolean(transition?.createdRequest);
  const reopened = Boolean(transition?.reopened);
  if (!conversation) {
    conversation = await Conversation.create({ participants: [senderId, receiverId], initiatedBy: senderId, status: "pending" });
  } else if (reopened) {
    // The person who rejected the request chose to talk again: reopen for both sides.
    conversation.status = "accepted";
    conversation.acceptedAt = new Date();
  }

  let replyToId = null;
  if (req.body.replyTo) {
    requireObjectId(req.body.replyTo, "reply id");
    const original = await Message.findOne({ _id: req.body.replyTo, conversationId: conversation._id });
    if (original) replyToId = original._id;
  }

  const envelope = describeEncryptedText(text);
  const message = await Message.create({
    conversationId: conversation._id,
    senderId,
    receiverId,
    text,
    image: imageUrl,
    attachment,
    forwarded,
    expiresAt: expiry,
    replyTo: replyToId,
    encryptionVersion: envelope.encryptionVersion,
    keyId: envelope.keyId,
  });
  conversation.lastMessage = message._id;
  await conversation.save();
  const populated = await Message.findById(message._id).populate("replyTo", replyFields);
  logger.info("[CHAT MESSAGE] persistence succeeded", {
    messageId: String(populated._id),
    conversationId: String(conversation._id),
    senderId: String(senderId),
    recipientId: receiverId,
    encryptionVersion: envelope.encryptionVersion,
    ciphertextLength: text.length,
  });

  emitToUser(receiverId, "newMessage", populated);
  emitToUser(senderId, "newMessage", populated);
  if (reopened) {
    const updated = await Conversation.findById(conversation._id)
      .populate("participants", publicUser)
      .populate("initiatedBy", publicUser)
      .populate("lastMessage");
    emitToUser(receiverId, "conversationUpdated", updated);
    emitToUser(senderId, "conversationUpdated", updated);
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
  // Editing is a way to send new content, so a rejected sender can't use it either.
  assertCanSendMessage(await Conversation.findById(message.conversationId).select("status initiatedBy"), req.user._id);
  const text = validateMessageText(req.body.text || "");
  if (!text) throw new AppError(400, "Message text is required.");
  const envelope = describeEncryptedText(text);
  message.text = text;
  message.edited = true;
  message.encryptionVersion = envelope.encryptionVersion;
  message.keyId = envelope.keyId;
  await message.save();
  emitToUser(message.receiverId, "messageEdited", message);
  emitToUser(message.senderId, "messageEdited", message);
  res.status(200).json(message);
});

// Only remove the Cloudinary file when no other message (e.g. a forward) still points at it.
const releaseAttachment = async (attachment, messageId) => {
  if (!attachment?.publicId) return;
  const stillUsed = await Message.exists({ _id: { $ne: messageId }, "attachment.publicId": attachment.publicId, deleted: false });
  if (!stillUsed) await destroyAttachment(attachment);
};

export const deleteMessage = asyncHandler(async (req, res) => {
  if (req.query.scope === "me") {
    requireObjectId(req.params.messageId, "message id");
    const message = await Message.findOne({
      _id: req.params.messageId,
      $or: [{ senderId: req.user._id }, { receiverId: req.user._id }],
    });
    if (!message) throw new AppError(404, "Message not found.");
    await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: req.user._id } });
    emitToUser(req.user._id, "messageHidden", { _id: message._id, conversationId: message.conversationId });
    return res.status(200).json({ ok: true, _id: message._id });
  }

  const message = await ownedMessage(req);
  if (message.deleted) throw new AppError(400, "Message is already deleted.");
  const attachment = message.attachment?.toObject ? message.attachment.toObject() : message.attachment;
  message.deleted = true;
  message.text = "";
  message.image = "";
  message.attachment = null;
  await message.save();
  await Conversation.updateOne({ _id: message.conversationId }, { $pull: { pinnedMessages: { messageId: message._id } } });
  const payload = { _id: message._id, conversationId: message.conversationId };
  emitToUser(message.receiverId, "messageDeleted", payload);
  emitToUser(message.senderId, "messageDeleted", payload);
  releaseAttachment(attachment, message._id).catch(() => {});
  res.status(200).json(message);
});

export const getChats = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const conversations = await Conversation.find({
    participants: me,
    $or: [
      { status: "accepted" },
      { status: { $in: ["pending", "declined"] }, initiatedBy: me },
    ],
  })
    .populate("participants", publicUser).populate("lastMessage").sort({ updatedAt: -1 }).limit(200);

  // Chats this user deleted stay hidden until a newer message arrives.
  const visible = conversations.filter((conversation) => {
    const cleared = clearedAtFor(conversation, me);
    if (!cleared) return true;
    const last = conversation.lastMessage?.createdAt;
    return Boolean(last && new Date(last) > cleared);
  });

  const unreadMatch = visible.map((conversation) => {
    const cleared = clearedAtFor(conversation, me);
    return cleared ? { conversationId: conversation._id, createdAt: { $gt: cleared } } : { conversationId: conversation._id };
  });
  const unread = unreadMatch.length ? await Message.aggregate([
    { $match: { receiverId: me, seen: false, deleted: false, deletedFor: { $ne: me }, $or: unreadMatch } },
    { $group: { _id: "$conversationId", count: { $sum: 1 } } },
  ]) : [];
  const unreadByConversation = Object.fromEntries(unread.map((item) => [item._id.toString(), item.count]));
  res.status(200).json(visible.map((conversation) => {
    const locked = isLockedFor(conversation, me);
    const last = conversation.lastMessage;
    return {
      _id: conversation._id,
      user: otherParticipant(conversation, me),
      // A locked chat's list entry never carries message content, only when it happened.
      lastMessage: locked && last ? { _id: last._id, createdAt: last.createdAt, senderId: last.senderId, locked: true } : last,
      updatedAt: conversation.updatedAt,
      unreadCount: unreadByConversation[conversation._id.toString()] || 0,
      muted: isMuted(conversation, me),
      locked,
      status: conversation.status,
      initiatedBy: conversation.initiatedBy,
      conversationVibe: ALLOWED_VIBES.includes(conversation.conversationVibe) ? conversation.conversationVibe : "neutral",
    };
  }));
});

// Requests this user rejected. Only they can reopen these chats, by sending a message.
export const getRejected = asyncHandler(async (req, res) => {
  const rejected = await Conversation.find({ participants: req.user._id, initiatedBy: { $ne: req.user._id }, status: "declined" })
    .populate("participants", publicUser).sort({ updatedAt: -1 }).limit(100);
  res.status(200).json(rejected.map((conversation) => ({
    _id: conversation._id,
    status: conversation.status,
    initiatedBy: initiatorId(conversation),
    updatedAt: conversation.updatedAt,
    user: otherParticipant(conversation, req.user._id),
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
  let systemMessage = null;
  if (status === "declined") {
    systemMessage = await Message.create({
      conversationId: conversation._id,
      senderId: req.user._id,
      receiverId: conversation.initiatedBy,
      text: REQUEST_DECLINED_TEXT,
      kind: "system",
      systemEvent: REQUEST_DECLINED_EVENT,
    });
    conversation.lastMessage = systemMessage._id;
    await conversation.save();
  }
  const populated = await Conversation.findById(conversation._id).populate("participants", publicUser).populate("initiatedBy", publicUser).populate("lastMessage");
  const initiator = otherParticipant(populated, req.user._id);
  if (systemMessage) emitToUser(initiator._id, "newMessage", systemMessage);
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
      User.findById(req.user._id).select("mood moodUpdatedAt availability"),
      User.findById(req.params.userId).select("mood moodUpdatedAt availability"),
    ]);
    return res.status(200).json({
      mine: serializeUserMood(me),
      theirs: serializeUserMood(other),
      conversationId: null,
      muted: false,
      mineAvailability: me?.availability || null,
      theirAvailability: other?.availability || null,
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
    const other = await User.findById(req.params.userId).select("mood moodUpdatedAt availability");
    return res.status(200).json({
      mine: { mood, updatedAt },
      theirs: serializeUserMood(other),
      conversationId: null,
      muted: false,
      mineAvailability: null,
      theirAvailability: other?.availability || null,
    });
  }
  res.status(200).json(await moodPayload(conversation, req.user._id));
});

const serializeConversation = (conversation, myId) => {
  const now = Date.now();
  const modes = (conversation.participantModes || []).filter((mode) => !mode.expiresAt || new Date(mode.expiresAt).getTime() > now);
  const mineMode = myId ? modes.find((mode) => String(mode.userId) === String(myId)) : null;
  const theirsMode = myId ? modes.find((mode) => String(mode.userId) !== String(myId)) : null;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const rituals = (conversation.rituals || []).map((ritual) => {
    const last = ritual.lastPromptedAt ? new Date(ritual.lastPromptedAt) : null;
    const due = !ritual.paused && (!last || (ritual.recurrence === "weekly" ? last < startOfWeek : last < startOfDay));
    return { _id: ritual._id, key: ritual.key, recurrence: ritual.recurrence, paused: ritual.paused, lastPromptedAt: ritual.lastPromptedAt, due };
  });
  return {
    conversationId: conversation._id,
    _id: conversation._id,
    participants: conversation.participants,
    conversationVibe: ALLOWED_VIBES.includes(conversation.conversationVibe) ? conversation.conversationVibe : "neutral",
    status: conversation.status,
    lastMessage: conversation.lastMessage,
    relationshipType: conversation.relationshipType || "",
    relationshipCustom: conversation.relationshipCustom || "",
    myMode: mineMode || null,
    theirMode: theirsMode || null,
    appearance: {
      wallpaper: conversation.appearance?.wallpaper || "default",
      bubbleStyle: conversation.appearance?.bubbleStyle || "classic",
    },
    locked: Boolean(conversation.lockedBy?.some((id) => String(id) === String(myId))),
    defaultDisappearing: Boolean(conversation.defaultDisappearing),
    status: conversation.status,
    initiatedBy: initiatorId(conversation),
    rituals,
    pinnedMessages: serializePins(conversation, myId),
  };
};

// Locked chats only reveal their content (pins) to requests carrying an unlock token.
const serializeConversationFor = (req, conversation) => {
  const payload = serializeConversation(conversation, req.user._id);
  if (isLockedFor(conversation, req.user._id) && !hasValidUnlock(req, conversation._id)) payload.pinnedMessages = [];
  return payload;
};

const serializePins = (conversation, myId) => (conversation.pinnedMessages || [])
  .filter((pin) => pin.messageId && typeof pin.messageId === "object" && !pin.messageId.deleted
    && !(pin.messageId.deletedFor || []).some((id) => String(id) === String(myId))
    && !(clearedAtFor(conversation, myId) && new Date(pin.messageId.createdAt) <= clearedAtFor(conversation, myId)))
  .map((pin) => ({
    messageId: String(pin.messageId._id),
    pinnedBy: pin.pinnedBy ? String(pin.pinnedBy) : null,
    pinnedAt: pin.pinnedAt,
    message: {
      _id: pin.messageId._id,
      senderId: pin.messageId.senderId,
      text: pin.messageId.text,
      image: pin.messageId.image,
      attachment: pin.messageId.attachment,
      createdAt: pin.messageId.createdAt,
    },
  }));

const loadParticipantConversation = async (conversationId, userId) => {
  requireObjectId(conversationId, "conversation id");
  const conversation = await Conversation.findById(conversationId)
    .populate("participants", publicUser)
    .populate("lastMessage")
    .populate("pinnedMessages.messageId", pinFields);
  if (!conversation) throw new AppError(404, "Conversation not found.");
  if (!conversation.participants.some((participant) => participantId(participant) === String(userId))) {
    throw new AppError(403, "You are not part of this conversation.");
  }
  return conversation;
};

export const getConversationDetails = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  res.status(200).json(serializeConversationFor(req, conversation));
});

export const updateConversationVibe = asyncHandler(async (req, res) => {
  const key = (req.body.key || "").trim().toLowerCase();
  if (!ALLOWED_VIBES.includes(key)) throw new AppError(400, "Invalid conversation vibe.");
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  assertCanSendMessage(conversation, req.user._id);
  conversation.conversationVibe = key;
  await conversation.save();
  const populated = await Conversation.findById(conversation._id)
    .populate("participants", publicUser)
    .populate("lastMessage")
    .populate("pinnedMessages.messageId", pinFields);
  const payload = serializeConversation(populated, req.user._id);
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

export { serializeConversation, serializeConversationFor, loadParticipantConversation, participantId };

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

const ownedConversationMessage = async (req) => {
  requireObjectId(req.params.messageId, "message id");
  const message = await Message.findById(req.params.messageId);
  if (!message) throw new AppError(404, "Message not found.");
  const mine = String(message.senderId) === String(req.user._id) || String(message.receiverId) === String(req.user._id);
  if (!mine) throw new AppError(403, "You cannot react to this message.");
  const conversation = await Conversation.findById(message.conversationId);
  assertCanSendMessage(conversation, req.user._id);
  return message;
};

const emitReaction = (message, event) => {
  const payload = { messageId: message._id, conversationId: message.conversationId, reactions: message.reactions || [] };
  emitToUser(message.senderId, event, payload);
  if (String(message.receiverId) !== String(message.senderId)) emitToUser(message.receiverId, event, payload);
};

export const upsertMessageReaction = asyncHandler(async (req, res) => {
  const key = (req.body.key || "").trim().toLowerCase();
  if (!REACTION_KEYS.includes(key)) throw new AppError(400, "Invalid reaction.");
  const message = await ownedConversationMessage(req);
  const reactions = message.reactions || [];
  const existing = reactions.find((item) => String(item.userId) === String(req.user._id));
  const event = existing ? "messageReactionUpdated" : "messageReactionAdded";
  message.reactions = [
    ...reactions.filter((item) => String(item.userId) !== String(req.user._id)),
    { userId: req.user._id, key, createdAt: new Date() },
  ];
  await message.save();
  emitReaction(message, event);
  res.status(200).json({ reactions: message.reactions });
});

export const removeMessageReaction = asyncHandler(async (req, res) => {
  const message = await ownedConversationMessage(req);
  const before = (message.reactions || []).length;
  message.reactions = (message.reactions || []).filter((item) => String(item.userId) !== String(req.user._id));
  if (message.reactions.length === before) return res.status(200).json({ reactions: message.reactions });
  await message.save();
  emitReaction(message, "messageReactionRemoved");
  res.status(200).json({ reactions: message.reactions });
});

export const getUploadSignature = asyncHandler(async (req, res) => {
  res.status(200).json(createUploadSignature(req.user._id, String(req.body.kind || "")));
});

const emitPins = (conversation, payload) => {
  conversation.participants.forEach((participant) => {
    emitToUser(participantId(participant), "conversationPinsUpdated", payload);
  });
};

const pinsPayload = async (conversationId, myId) => {
  const fresh = await loadParticipantConversation(conversationId, myId);
  return { conversationId: fresh._id, pinnedMessages: serializePins(fresh, myId) };
};

export const pinMessage = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  assertCanSendMessage(conversation, req.user._id);
  requireObjectId(req.params.messageId, "message id");
  const message = await Message.findOne({ _id: req.params.messageId, conversationId: conversation._id, deleted: false, kind: "user" });
  if (!message) throw new AppError(404, "Message not found in this conversation.");
  const already = (conversation.pinnedMessages || []).some((pin) => String(pin.messageId?._id || pin.messageId) === String(message._id));
  if (!already) {
    // Newest pin first; keep only the most recent few like other chat apps.
    await Conversation.updateOne(
      { _id: conversation._id },
      { $push: { pinnedMessages: { $each: [{ messageId: message._id, pinnedBy: req.user._id, pinnedAt: new Date() }], $position: 0, $slice: MAX_PINNED_MESSAGES } } }
    );
  }
  const payload = await pinsPayload(conversation._id, req.user._id);
  emitPins(conversation, payload);
  res.status(200).json(payload);
});

export const unpinMessage = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  requireObjectId(req.params.messageId, "message id");
  await Conversation.updateOne({ _id: conversation._id }, { $pull: { pinnedMessages: { messageId: req.params.messageId } } });
  const payload = await pinsPayload(conversation._id, req.user._id);
  emitPins(conversation, payload);
  res.status(200).json(payload);
});

export const setBlocked = asyncHandler(async (req, res) => {
  const otherId = requireObjectId(req.params.userId, "user id");
  if (String(otherId) === String(req.user._id)) throw new AppError(400, "You can't block yourself.");
  if (!(await User.exists({ _id: otherId }))) throw new AppError(404, "User not found.");
  const blocked = Boolean(req.body.blocked);
  const update = blocked ? { $addToSet: { blockedUsers: otherId } } : { $pull: { blockedUsers: otherId } };
  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select("blockedUsers");
  res.status(200).json({ blockedUsers: (user.blockedUsers || []).map((id) => String(id)) });
});

// "Delete chat": hides the history for this user only. The other person keeps their messages,
// and the chat comes back (empty) if either of you sends something new.
export const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  assertUnlocked(req, conversation);
  const at = new Date();
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { [`clearedAt.${String(req.user._id)}`]: at }, $pull: { lockedBy: req.user._id } }
  );
  // Clearing doesn't count as reading: leave read receipts alone, just stop counting them as unread.
  emitToUser(req.user._id, "conversationCleared", { conversationId: conversation._id, clearedAt: at });
  res.status(200).json({ ok: true, conversationId: conversation._id, clearedAt: at });
});

export const unlockConversation = asyncHandler(async (req, res) => {
  const conversation = await loadParticipantConversation(req.params.conversationId, req.user._id);
  if (!isLockedFor(conversation, req.user._id)) return res.status(200).json({ token: null, locked: false });
  const user = await User.findById(req.user._id).select("chatLockPinHash");
  if (!(await pinMatches(user, req.body.pin))) throw new AppError(401, "Wrong PIN.");
  res.status(200).json({ ...issueUnlockToken(req.user._id, conversation._id), locked: true });
});

// Set or change the chat-lock PIN. Changing needs the current PIN, or the account password if it was forgotten.
export const setChatLockPin = asyncHandler(async (req, res) => {
  const pin = validatePin(req.body.pin);
  const user = await User.findById(req.user._id).select("password chatLockPinHash");
  if (user.chatLockPinHash) {
    const viaPin = req.body.currentPin != null && (await pinMatches(user, req.body.currentPin));
    const viaPassword = !viaPin && req.body.password && (await bcrypt.compare(String(req.body.password), user.password));
    if (!viaPin && !viaPassword) throw new AppError(401, "Enter your current PIN or account password.");
  }
  user.chatLockPinHash = await hashPin(pin);
  await user.save();
  res.status(200).json({ hasChatLockPin: true });
});
