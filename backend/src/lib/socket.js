import {Server} from "socket.io"
import http from "http"
import express from "express"
import Conversation from "../models/conversation-model.js"

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        // origin: [process.env.CLIENT_URL || "http://localhost:5173"],
        origin: "*",
        methods: ["GET", "POST"]
    }

})

export function getReceiverSocketId(userId) {
    return userSocketMap[userId];
  }

const userSocketMap = {};

    io.on("connection", (socket) => {
        console.log("user connected", socket.id);

        const userId = socket.handshake.query.userId;
        if (userId) {
            userSocketMap[userId] = socket.id;
          
        }

        // Typing is relayed only after confirming both users belong to the same conversation.
        const relayTyping = async (event, payload = {}) => {
          if (!userId || !payload.to) return;
          const conversation = await Conversation.exists({
            participants: { $all: [userId, payload.to], $size: 2 },
          });
          if (!conversation) return;
          socket.data.typingTarget = { to: payload.to, conversationId: conversation._id.toString() };
          const targetSocket = getReceiverSocketId(payload.to);
          if (targetSocket) io.to(targetSocket).emit(event, { from: userId, conversationId: conversation._id.toString() });
        };
        socket.on("typing", (payload) => relayTyping("typing", payload));
        socket.on("stopTyping", (payload) => {
          relayTyping("stopTyping", payload);
          socket.data.typingTarget = null;
        });

        io.emit("getOnlineUsers", Object.keys(userSocketMap));

        socket.on("disconnect", ()=>{
        console.log("user dissconneted", socket.id)
        delete userSocketMap[userId];
        const target = socket.data.typingTarget;
        if (target) {
          const targetSocket = getReceiverSocketId(target.to);
          if (targetSocket) io.to(targetSocket).emit("stopTyping", { from: userId, conversationId: target.conversationId });
        }
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
        })
    })


export {io, app, server}
