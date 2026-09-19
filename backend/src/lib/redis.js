import { createClient } from "redis";
import { logger } from "./logger.js";

let client;
let subscriber;

export function getRedisUrl() {
  return String(process.env.REDIS_URL || "").trim();
}

export function isRedisEnabled() {
  return Boolean(getRedisUrl()) && process.env.NODE_ENV !== "test";
}

export async function connectRedis() {
  if (!isRedisEnabled()) return null;
  if (client?.isOpen) return client;

  client = createClient({ url: getRedisUrl() });
  client.on("error", (error) => logger.error("Redis error:", error.message));

  try {
    await client.connect();
    logger.info("Connected to Redis");
    return client;
  } catch (error) {
    logger.error("Redis connection error:", error.message);
    process.exit(1);
  }
}

export function getRedis() {
  return client?.isOpen ? client : null;
}

export async function createRedisSubscriber() {
  const pub = getRedis();
  if (!pub) return null;
  if (subscriber?.isOpen) return subscriber;

  subscriber = pub.duplicate();
  subscriber.on("error", (error) => logger.error("Redis subscriber error:", error.message));
  await subscriber.connect();
  return subscriber;
}

export async function pingRedis() {
  const redis = getRedis();
  if (!redis) return false;
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}
