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

    reactions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        key: { type: String, required: true, enum: ["feel", "here", "more", "laugh", "think", "got-it", "thanks"] },
        createdAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],

    kind: { type: String, enum: ["user", "system"], default: "user" },
    systemEvent: { type: String, default: "" },

    encryptionVersion: { type: Number, default: null },
    keyId: { type: String, default: null },

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
