import mongoose from "mongoose";
import { MEMORY_TYPES } from "../lib/catalog.js";

const memorySchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    note: { type: String, default: "", trim: true, maxlength: 280 },
    type: { type: String, enum: MEMORY_TYPES, default: "memory" },
  },
  { timestamps: true }
);

memorySchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.model("Memory", memorySchema);
