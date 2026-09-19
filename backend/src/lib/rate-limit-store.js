import { getRedis } from "./redis.js";

export class OptionalRedisStore {
  constructor({ prefix = "vl:rl:" } = {}) {
    this.prefix = prefix;
    this.windowMs = 60_000;
    this.hits = new Map();
  }

  init(options) {
    if (options?.windowMs) this.windowMs = options.windowMs;
  }

  async increment(key) {
    const redis = getRedis();
    if (!redis) return this.#incrementMemory(key);

    const redisKey = `${this.prefix}${key}`;
    const results = await redis.multi().incr(redisKey).pTTL(redisKey).exec();
    const totalHits = Number(results[0]);
    let ttl = Number(results[1]);
    if (ttl < 0) {
      await redis.pExpire(redisKey, this.windowMs);
      ttl = this.windowMs;
    }
    return { totalHits, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
  }

  async decrement(key) {
    const redis = getRedis();
    if (!redis) return this.#decrementMemory(key);

    const redisKey = `${this.prefix}${key}`;
    const hits = await redis.decr(redisKey);
    if (hits <= 0) await redis.del(redisKey);
  }

  async resetKey(key) {
    const redis = getRedis();
    if (!redis) {
      this.hits.delete(key);
      return;
    }
    await redis.del(`${this.prefix}${key}`);
  }

  #incrementMemory(key) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetTime <= now) {
      entry = { totalHits: 0, resetTime: now + this.windowMs };
    }
    entry.totalHits += 1;
    this.hits.set(key, entry);
    return { totalHits: entry.totalHits, resetTime: new Date(entry.resetTime) };
  }

  #decrementMemory(key) {
    const entry = this.hits.get(key);
    if (!entry) return;
    entry.totalHits = Math.max(0, entry.totalHits - 1);
  }
}
