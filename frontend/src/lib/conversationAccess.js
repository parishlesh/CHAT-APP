export const canComposeInConversation = (conversationStatus, conversationInitiatedBy, myId) => {
  if (!conversationStatus || conversationStatus === "accepted") return true;
  const iAmInitiator = String(conversationInitiatedBy) === String(myId);
  if (conversationStatus === "pending") return iAmInitiator;
  if (conversationStatus === "declined") return !iAmInitiator;
  return false;
};
