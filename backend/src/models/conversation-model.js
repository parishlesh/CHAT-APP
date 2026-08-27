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
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({
  participants: 1,
});

const Conversation = mongoose.model(
  "Conversation",
  conversationSchema
);

export default Conversation;