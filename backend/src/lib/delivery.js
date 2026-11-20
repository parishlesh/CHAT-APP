import Message from "../models/message-model.js";
import { isObjectId } from "./validate.js";

// "Delivered" (double grey tick) means the message reached the recipient's device: either their
// app acknowledged a live message, or they came online and their app is syncing.
// `notify(userId, event, payload)` is passed in to avoid a circular import with socket.js.
export async function markDelivered(receiverId, notify, messageIds = null) {
  const filter = {
    receiverId,
    delivered: { $ne: true },
    deleted: false,
    kind: "user",
  };
  if (messageIds) {
    const ids = [...new Set(messageIds.map(String))].filter(isObjectId).slice(0, 200);
    if (!ids.length) return [];
    filter._id = { $in: ids };
  }
  const pending = await Message.find(filter).select("_id senderId conversationId").limit(5000).lean();
  if (!pending.length) return [];
  const deliveredAt = new Date();
  await Message.updateMany({ _id: { $in: pending.map((message) => message._id) } }, { $set: { delivered: true, deliveredAt } });

  const bySender = new Map();
  pending.forEach((message) => {
    const key = String(message.senderId);
    if (!bySender.has(key)) bySender.set(key, []);
    bySender.get(key).push(String(message._id));
  });
  bySender.forEach((ids, senderId) => notify(senderId, "messagesDelivered", { messageIds: ids, deliveredAt }));
  return pending.map((message) => String(message._id));
}
