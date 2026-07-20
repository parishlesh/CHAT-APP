import cloudinary from "../lib/cloudinary.js";
import Conversation from "../models/conversation-model.js";
import Message from "../models/message-model.js";
import User from "../models/user-model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

const publicUser = "-password";

const pairQuery = (firstId, secondId) => ({ participants: { $all: [firstId, secondId], $size: 2 } });

const otherParticipant = (conversation, myId) =>
  conversation.participants.find((participant) => participant._id.toString() !== myId.toString());

const emitToUser = (userId, event, payload) => {
  const socketId = getReceiverSocketId(userId.toString());
  if (socketId) io.to(socketId).emit(event, payload);
};

export const searchUsers = async (req, res) => {
  try {
    const query = (req.query.q || "").trim();
    if (!query) return res.status(200).json([]);

    const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ fullName: expression }, { username: expression }, { email: expression }],
    }).select(publicUser).limit(20);
    res.status(200).json(users);
  } catch (error) {
    console.error("search users:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUsersForSidebar = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select(publicUser);
    res.status(200).json(users);
  } catch (error) {
    console.error("get users:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findOne(pairQuery(req.user._id, req.params.id));
    if (!conversation) return res.status(200).json([]);
    const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (error) {
    console.error("get messages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text = "", image } = req.body;
    const senderId = req.user._id;
    const receiverId = req.params.id;
    if (!text.trim() && !image) return res.status(400).json({ message: "Message text or image is required." });
    if (senderId.toString() === receiverId) return res.status(400).json({ message: "You cannot message yourself." });
    if (!(await User.exists({ _id: receiverId }))) return res.status(404).json({ message: "User not found." });

    let imageUrl = "";
    if (image) {
      const upload = await cloudinary.uploader.upload(image, { folder: "chat-images", resource_type: "image" });
      imageUrl = upload.secure_url;
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

    const message = await Message.create({ conversationId: conversation._id, senderId, receiverId, text: text.trim(), image: imageUrl });
    conversation.lastMessage = message._id;
    await conversation.save();

    if (conversation.status === "accepted") emitToUser(receiverId, "newMessage", message);
    if (createdRequest) {
      const request = await Conversation.findById(conversation._id)
        .populate("initiatedBy", publicUser)
        .populate("participants", publicUser)
        .populate("lastMessage");
      emitToUser(receiverId, "conversationRequest", request);
    }
    res.status(201).json(message);
  } catch (error) {
    console.error("send message:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getChats = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id, status: "accepted" })
      .populate("participants", publicUser).populate("lastMessage").sort({ updatedAt: -1 });
    res.status(200).json(conversations.map((conversation) => ({
      _id: conversation._id,
      user: otherParticipant(conversation, req.user._id),
      lastMessage: conversation.lastMessage,
      updatedAt: conversation.updatedAt,
    })));
  } catch (error) {
    console.error("get chats:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getRequests = async (req, res) => {
  try {
    const requests = await Conversation.find({ participants: req.user._id, initiatedBy: { $ne: req.user._id }, status: "pending" })
      .populate("participants", publicUser).populate("initiatedBy", publicUser).populate("lastMessage").sort({ updatedAt: -1 });
    res.status(200).json(requests.map((conversation) => ({ ...conversation.toObject(), user: otherParticipant(conversation, req.user._id) })));
  } catch (error) {
    console.error("get requests:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

const respondToRequest = async (req, res, status) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, participants: req.user._id, initiatedBy: { $ne: req.user._id }, status: "pending" });
  if (!conversation) return res.status(404).json({ message: "Pending request not found." });
  conversation.status = status;
  if (status === "accepted") conversation.acceptedAt = new Date();
  await conversation.save();
  const populated = await Conversation.findById(conversation._id).populate("participants", publicUser).populate("initiatedBy", publicUser).populate("lastMessage");
  const initiator = otherParticipant(populated, req.user._id);
  emitToUser(initiator._id, "conversationUpdated", populated);
  emitToUser(req.user._id, "conversationUpdated", populated);
  res.status(200).json(populated);
};

export const acceptRequest = (req, res) => respondToRequest(req, res, "accepted").catch((error) => {
  console.error("accept request:", error.message); res.status(500).json({ message: "Internal server error" });
});
export const rejectRequest = (req, res) => respondToRequest(req, res, "declined").catch((error) => {
  console.error("reject request:", error.message); res.status(500).json({ message: "Internal server error" });
});
