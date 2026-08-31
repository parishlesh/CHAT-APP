import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import Conversation from "../models/conversation-model.js";
import { isOriginAllowed } from "./origins.js";
import { addUserSocket, getOnlineUserIds, getReceiverSocketId, getSocketIds, removeUserSocket } from "./presence.js";
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

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").filter(Boolean).map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
}

io.use((socket, next) => {
  try {
    const token = parseCookies(socket.handshake.headers.cookie || "").jwt;
    if (!token || !process.env.JWT_SECRET) return next(new Error("unauthorized"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.userId || !isObjectId(decoded.userId)) return next(new Error("unauthorized"));
    socket.userId = String(decoded.userId);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

export function emitToUser(userId, event, payload) {
  getSocketIds(userId).forEach((socketId) => io.to(socketId).emit(event, payload));
}

io.on("connection", (socket) => {
  const userId = socket.userId;
  addUserSocket(userId, socket.id);
  logger.debug("socket connected", socket.id);
  io.emit("getOnlineUsers", getOnlineUserIds());

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

  socket.on("disconnect", () => {
    const { wentOffline } = removeUserSocket(userId, socket.id);
    const target = socket.data.typingTarget;
    if (target) emitToUser(target.to, "stopTyping", { from: userId, conversationId: target.conversationId });
    if (wentOffline) io.emit("getOnlineUsers", getOnlineUserIds());
    else io.emit("getOnlineUsers", getOnlineUserIds());
    logger.debug("socket disconnected", socket.id);
  });
});

export { io, app, server, getReceiverSocketId };
