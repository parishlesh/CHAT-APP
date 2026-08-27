import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },

    acceptedAt: Date,

    moods: {
      type: Map,
      of: new mongoose.Schema(
        {
          mood: {
            type: String,
            enum: ["happy", "angry", "calm", "sad", "professional", "excited", "sleepy", "romantic"],
            required: true,
          },
          updatedAt: {
            type: Date,
            default: Date.now,
          },
        },
        { _id: false }
      ),
      default: () => new Map(),
    },

    mutedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    conversationVibe: {
      type: String,
      enum: ["neutral", "happy", "angry", "sad", "romantic", "playful", "excited", "calm", "focused", "celebration"],
      default: "neutral",
    },
  },
  {
    timestamps: true,
  }
);

const vibeKeys = ["neutral", "happy", "angry", "sad", "romantic", "playful", "excited", "calm", "focused", "celebration"];
const vibeFromStored = (value) => {
  if (value && typeof value === "object") value = value.key;
  const key = String(value || "neutral").trim().toLowerCase();
  return vibeKeys.includes(key) ? key : "neutral";
};

const vibePath = conversationSchema.path("conversationVibe");
const castVibe = vibePath.cast.bind(vibePath);
vibePath.cast = function castConversationVibe(value, ...rest) {
  return castVibe(vibeFromStored(value), ...rest);
};

conversationSchema.index({ participants: 1, status: 1, updatedAt: -1 });
conversationSchema.index({ participants: 1, initiatedBy: 1, status: 1 });

const Conversation = mongoose.model(
  "Conversation",
  conversationSchema
);

export default Conversation;