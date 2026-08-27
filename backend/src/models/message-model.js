import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: {
      type: String,
      default: "",
    },

    image: {
      type: String,
      default: "",
    },

    seen: {
      type: Boolean,
      default: false,
    },

    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },

    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    // TTL removes this document after its absolute expiration time.
    expiresAt: { type: Date, default: null, index: { expireAfterSeconds: 0 } },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ text: "text" });
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, seen: 1, deleted: 1, conversationId: 1 });

const Message = mongoose.model(
  "Message",
  messageSchema
);

export default Message;
