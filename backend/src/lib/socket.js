import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import Conversation from "../models/conversation-model.js";
import Message from "../models/message-model.js";
import User from "../models/user-model.js";
import { isOriginAllowed } from "./origins.js";
import { addUserSocket, getOnlineUserIds, getReceiverSocketId, removeUserSocket } from "./presence.js";
import { createRedisSubscriber, getRedis } from "./redis.js";
import { logger } from "./logger.js";
import { isObjectId } from "./validate.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["polling", "websocket"],
});

const userRoom = (userId) => `user:${String(userId)}`;

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").filter(Boolean).map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
}

io.use(async (socket, next) => {
  try {
    const token = parseCookies(socket.handshake.headers.cookie || "").jwt;
    if (!token || !process.env.JWT_SECRET) return next(new Error("unauthorized"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.userId || !isObjectId(decoded.userId)) return next(new Error("unauthorized"));
    const user = await User.findById(decoded.userId).select("tokenVersion");
    if (!user) return next(new Error("unauthorized"));
    if (Number(decoded.tv || 0) !== Number(user.tokenVersion || 0)) return next(new Error("unauthorized"));
    socket.userId = String(decoded.userId);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

let redisAdapterAttached = false;

export async function attachRedisAdapter() {
  if (redisAdapterAttached) return;
  const pubClient = getRedis();
  if (!pubClient) return;
  const subClient = await createRedisSubscriber();
  if (!subClient) return;
  io.adapter(createAdapter(pubClient, subClient));
  redisAdapterAttached = true;
  logger.info("Socket.IO Redis adapter attached");
}

export function disconnectUserSockets(userId) {
  io.in(userRoom(userId)).disconnectSockets(true);
}

export function emitToUser(userId, event, payload) {
  io.to(userRoom(userId)).emit(event, payload);
}

io.on("connection", async (socket) => {
  const userId = socket.userId;
  socket.join(userRoom(userId));
  await addUserSocket(userId, socket.id);
  logger.debug("socket connected", socket.id);
  io.emit("getOnlineUsers", await getOnlineUserIds());

  const relayTyping = async (event, payload = {}) => {
    if (!userId || !payload.to || !isObjectId(payload.to)) return;
    const conversation = await Conversation.exists({
      participants: { $all: [userId, payload.to], $size: 2 },
    });
    if (!conversation) return;
    socket.data.typingTarget = { to: payload.to, conversationId: conversation._id.toString() };
    emitToUser(payload.to, event, { from: userId, conversationId: conversation._id.toString() });
  };

  socket.on("typing", (payload) => relayTyping("typing", payload));
  socket.on("stopTyping", (payload) => {
    relayTyping("stopTyping", payload);
    socket.data.typingTarget = null;
  });

  socket.on("markSeen", async (payload = {}) => {
    const peerId = payload.peerId;
    if (!peerId || !isObjectId(peerId)) return;
    const conversation = await Conversation.findOne({ participants: { $all: [userId, peerId], $size: 2 } });
    if (!conversation) return;
    const unseen = await Message.find({
      conversationId: conversation._id,
      senderId: peerId,
      receiverId: userId,
      seen: false,
      deleted: false,
    }).select("_id");
    if (!unseen.length) return;
    const messageIds = unseen.map((message) => message._id.toString());
    await Message.updateMany({ _id: { $in: messageIds } }, { $set: { seen: true } });
    emitToUser(peerId, "messagesSeen", { conversationId: conversation._id, messageIds });
  });

  socket.on("disconnect", async () => {
    await removeUserSocket(userId, socket.id);
    const target = socket.data.typingTarget;
    if (target) emitToUser(target.to, "stopTyping", { from: userId, conversationId: target.conversationId });
    io.emit("getOnlineUsers", await getOnlineUserIds());
    logger.debug("socket disconnected", socket.id);
  });
});

export { io, app, server, getReceiverSocketId };
