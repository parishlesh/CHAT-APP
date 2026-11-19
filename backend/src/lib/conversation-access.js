import { AppError } from "./errors.js";

export const REQUEST_DECLINED_EVENT = "request_declined";
export const REQUEST_DECLINED_TEXT = "This user has rejected your conversation request.";

export const initiatorId = (conversation) => String(conversation?.initiatedBy?._id || conversation?.initiatedBy || "");

// The person whose request was rejected. They stay locked out until the other person messages them.
export const isRejectedParty = (conversation, userId) => (
  conversation?.status === "declined" && initiatorId(conversation) === String(userId)
);

export const canInteract = (conversation, userId) => {
  try {
    assertCanSendMessage(conversation, userId);
    return true;
  } catch {
    return false;
  }
};

// Mood/availability broadcasts skip declined chats in both directions: the rejected person
// doesn't see the other's status, and doesn't get to push theirs either.
export const reachablePeerIds = (conversations, userId) => {
  const peerIds = new Set();
  conversations.forEach((conversation) => {
    if (conversation?.status === "declined") return;
    (conversation.participants || []).forEach((participant) => {
      const id = String(participant?._id ?? participant);
      if (id !== String(userId)) peerIds.add(id);
    });
  });
  return peerIds;
};

// How a successful send changes the conversation. Only the person who rejected the request
// can send into a declined conversation (assertCanSendMessage), and doing so reopens it
// fully, so both people can talk again without a new request.
export const statusAfterSend = (conversation, senderId) => {
  if (!conversation) return { status: "pending", initiatedBy: String(senderId), createdRequest: true };
  if (conversation.status === "declined") return { status: "accepted", reopened: true };
  return null;
};

export const assertCanSendMessage = (conversation, senderId) => {
  if (!conversation) return;
  const initiator = initiatorId(conversation);
  const sender = String(senderId);
  if (conversation.status === "pending" && initiator !== sender) {
    throw new AppError(403, "Accept this conversation request before sending a message.");
  }
  if (conversation.status === "declined" && initiator === sender) {
    throw new AppError(403, "This conversation request was rejected. You can't message this user again until they message you first.");
  }
};
