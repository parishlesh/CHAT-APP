import { AppError } from "./errors.js";

export const REQUEST_DECLINED_EVENT = "request_declined";
export const REQUEST_DECLINED_TEXT = "This user has rejected your conversation request.";

export const initiatorId = (conversation) => String(conversation?.initiatedBy?._id || conversation?.initiatedBy || "");

export const assertCanSendMessage = (conversation, senderId) => {
  if (!conversation) return;
  const initiator = initiatorId(conversation);
  const sender = String(senderId);
  if (conversation.status === "pending" && initiator !== sender) {
    throw new AppError(403, "Accept this conversation request before sending a message.");
  }
  if (conversation.status === "declined" && initiator !== sender) {
    throw new AppError(403, "This conversation request was rejected.");
  }
};
