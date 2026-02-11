import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { UserTier } from "@/lib/db/schema";

function createRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
  }

  return new Redis({ url, token });
}

// Lazy-init to avoid crashing at build time
let _redis: Redis | null = null;
function getRedis() {
  if (!_redis) _redis = createRedis();
  return _redis;
}

// ─── Capture Rate Limiters (per day) ─────────────────────

const captureLimiters: Record<UserTier, () => Ratelimit> = {
  free: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, "24 h"),
      analytics: true,
      prefix: "@ember/capture-free",
    }),
  pro: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(50, "24 h"),
      analytics: true,
      prefix: "@ember/capture-pro",
    }),
  founders: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(100, "24 h"),
      analytics: true,
      prefix: "@ember/capture-founders",
    }),
};

// ─── API Rate Limiters (per minute) ──────────────────────

const apiLimiters: Record<UserTier, () => Ratelimit> = {
  free: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      analytics: true,
      prefix: "@ember/api-free",
    }),
  pro: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      analytics: true,
      prefix: "@ember/api-pro",
    }),
  founders: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(200, "1 m"),
      analytics: true,
      prefix: "@ember/api-founders",
    }),
};

// ─── Wake Prompt Rate Limiters (per hour) ────────────────

const wakeLimiters: Record<UserTier, () => Ratelimit> = {
  free: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "@ember/wake-free",
    }),
  pro: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(50, "1 h"),
      analytics: true,
      prefix: "@ember/wake-pro",
    }),
  founders: () =>
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(100, "1 h"),
      analytics: true,
      prefix: "@ember/wake-founders",
    }),
};

// ─── Public API ──────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export async function checkCaptureLimit(
  userId: string,
  tier: UserTier
): Promise<RateLimitResult> {
  const limiter = captureLimiters[tier]();
  const result = await limiter.limit(userId);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export async function checkApiLimit(
  userId: string,
  tier: UserTier
): Promise<RateLimitResult> {
  const limiter = apiLimiters[tier]();
  const result = await limiter.limit(userId);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export async function checkWakeLimit(
  userId: string,
  tier: UserTier
): Promise<RateLimitResult> {
  const limiter = wakeLimiters[tier]();
  const result = await limiter.limit(userId);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
