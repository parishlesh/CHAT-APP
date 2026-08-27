const socketsByUser = new Map();

export function addUserSocket(userId, socketId) {
  if (!userId || !socketId) return;
  const key = String(userId);
  if (!socketsByUser.has(key)) socketsByUser.set(key, new Set());
  socketsByUser.get(key).add(socketId);
}

export function removeUserSocket(userId, socketId) {
  const key = String(userId);
  const sockets = socketsByUser.get(key);
  if (!sockets) return { wentOffline: false };
  sockets.delete(socketId);
  if (sockets.size === 0) {
    socketsByUser.delete(key);
    return { wentOffline: true };
  }
  return { wentOffline: false };
}

export function getOnlineUserIds() {
  return [...socketsByUser.keys()];
}

export function getSocketIds(userId) {
  return [...(socketsByUser.get(String(userId)) || [])];
}

export function getReceiverSocketId(userId) {
  return getSocketIds(userId)[0];
}

export function resetPresenceForTests() {
  socketsByUser.clear();
}
