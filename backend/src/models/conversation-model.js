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
      enum: ["neutral", "happy", "angry", "sad", "romantic", "playful", "excited", "calm", "focused", "celebration", "flirty", "serious", "work", "special"],
      default: "neutral",
    },

    relationshipType: {
      type: String,
      enum: ["", "close-friend", "family", "partner", "work", "study", "gaming", "travel", "custom"],
      default: "",
    },
    relationshipCustom: { type: String, default: "", trim: true, maxlength: 40 },

    participantModes: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        key: { type: String, enum: ["just-talk", "comfort", "listen", "advice", "laugh", "debate", "reply-later", "quiet"] },
        updatedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, default: null },
        _id: false,
      },
    ],

    appearance: {
      wallpaper: { type: String, enum: ["default", "minimal", "soft", "dark"], default: "default" },
      bubbleStyle: { type: String, enum: ["classic", "rounded", "compact"], default: "classic" },
    },

    lockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    defaultDisappearing: { type: Boolean, default: false },

    rituals: [
      {
        key: { type: String, enum: ["morning", "night", "weekly"] },
        recurrence: { type: String, enum: ["daily", "weekly"], default: "daily" },
        paused: { type: Boolean, default: false },
        lastPromptedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const vibeKeys = ["neutral", "happy", "angry", "sad", "romantic", "playful", "excited", "calm", "focused", "celebration", "flirty", "serious", "work", "special"];
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