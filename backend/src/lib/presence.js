import { getRedis } from "./redis.js";

const socketsByUser = new Map();
const PREFIX = "vl:presence";
const USER_TTL_SEC = 60 * 60 * 24;

const userKey = (userId) => `${PREFIX}:user:${String(userId)}`;
const onlineKey = () => `${PREFIX}:online`;

function addUserSocketMemory(userId, socketId) {
  if (!userId || !socketId) return;
  const key = String(userId);
  if (!socketsByUser.has(key)) socketsByUser.set(key, new Set());
  socketsByUser.get(key).add(socketId);
}

function removeUserSocketMemory(userId, socketId) {
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

export async function addUserSocket(userId, socketId) {
  if (!userId || !socketId) return;
  const redis = getRedis();
  if (!redis) {
    addUserSocketMemory(userId, socketId);
    return;
  }
  const key = String(userId);
  await redis.sAdd(userKey(key), socketId);
  await redis.expire(userKey(key), USER_TTL_SEC);
  await redis.sAdd(onlineKey(), key);
}

export async function removeUserSocket(userId, socketId) {
  const redis = getRedis();
  if (!redis) return removeUserSocketMemory(userId, socketId);

  const key = String(userId);
  await redis.sRem(userKey(key), socketId);
  const remaining = await redis.sCard(userKey(key));
  if (remaining === 0) {
    await redis.del(userKey(key));
    await redis.sRem(onlineKey(), key);
    return { wentOffline: true };
  }
  return { wentOffline: false };
}

export async function getOnlineUserIds() {
  const redis = getRedis();
  if (!redis) return [...socketsByUser.keys()];
  return redis.sMembers(onlineKey());
}

export async function getSocketIds(userId) {
  const redis = getRedis();
  if (!redis) return [...(socketsByUser.get(String(userId)) || [])];
  return redis.sMembers(userKey(userId));
}

export async function getReceiverSocketId(userId) {
  const ids = await getSocketIds(userId);
  return ids[0];
}

export async function resetPresenceForTests() {
  socketsByUser.clear();
}
