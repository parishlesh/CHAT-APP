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

    // Photo, video, voice note or document uploaded to Cloudinary (see lib/media.js).
    attachment: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: ["image", "video", "audio", "file"], required: true },
          url: { type: String, required: true },
          publicId: { type: String, required: true },
          resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
          name: { type: String, default: "" },
          mime: { type: String, default: "" },
          bytes: { type: Number, default: null },
          width: { type: Number, default: null },
          height: { type: Number, default: null },
          duration: { type: Number, default: null },
        },
        { _id: false }
      ),
      default: null,
    },

    forwarded: { type: Boolean, default: false },
    // "Delete for me": hidden only for these users.
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

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
        key: { type: String, required: true, enum: ["feel", "here", "more", "laugh", "think", "got-it", "thanks", "wow", "sad", "fire", "party"] },
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
messageSchema.index({ "attachment.publicId": 1 }, { sparse: true });

const Message = mongoose.model(
  "Message",
  messageSchema
);

export default Message;
