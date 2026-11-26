import type { Request, Response, NextFunction, RequestHandler } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitKind = "general" | "sensitive";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
}

const LIMITS: Record<RateLimitKind, { maxRequests: number; windowMs: number; windowStr: "10 s" | "60 s" }> = {
  general: { maxRequests: 30, windowMs: 10_000, windowStr: "10 s" },
  sensitive: { maxRequests: 5, windowMs: 60_000, windowStr: "60 s" },
};

const MAX_FALLBACK_ENTRIES = 10_000;
const memoryFallbackStore = new Map<string, number[]>();

let missingEnvWarned = false;
let upstashErrorWarned = false;
let cachedUpstashLimiters: { general: Ratelimit; sensitive: Ratelimit } | null | undefined;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
}

/**
 * Extracts the real client IP from Vercel/proxy `x-forwarded-for` (first entry)
 * with safe fallbacks to `req.ip` and socket remoteAddress.
 */
export function extractClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const rawFirst = Array.isArray(xff)
    ? xff[0]
    : typeof xff === "string"
    ? xff.split(",")[0]
    : undefined;

  const candidate = (rawFirst || req.ip || req.socket?.remoteAddress || "").trim();
  if (!candidate) return "unknown";
  // Strip IPv6-mapped IPv4 prefix if present and bound length for key safety
  return candidate.replace(/^::ffff:/i, "").slice(0, 64) || "unknown";
}

function getUpstashLimiters(): { general: Ratelimit; sensitive: Ratelimit } | null {
  if (cachedUpstashLimiters !== undefined) {
    return cachedUpstashLimiters;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    if (!missingEnvWarned && !isTestEnv()) {
      missingEnvWarned = true;
      console.warn(
        "⚠️ [RATE LIMIT NOTICE]: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. Falling back to per-instance in-memory rate limiting.",
      );
    }
    cachedUpstashLimiters = null;
    return null;
  }

  try {
    const redis = new Redis({ url, token });
    cachedUpstashLimiters = {
      general: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMITS.general.maxRequests, LIMITS.general.windowStr),
        prefix: "rl:general",
        analytics: false,
      }),
      sensitive: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMITS.sensitive.maxRequests, LIMITS.sensitive.windowStr),
        prefix: "rl:sensitive",
        analytics: false,
      }),
    };
  } catch (err) {
    if (!upstashErrorWarned) {
      upstashErrorWarned = true;
      console.warn("⚠️ [RATE LIMIT NOTICE]: Failed to initialize Upstash Redis client, using memory fallback:", (err as Error).message);
    }
    cachedUpstashLimiters = null;
  }

  return cachedUpstashLimiters;
}

function pruneMemoryFallback(now: number) {
  if (memoryFallbackStore.size <= MAX_FALLBACK_ENTRIES) return;
  for (const [k, timestamps] of memoryFallbackStore.entries()) {
    const latest = timestamps[timestamps.length - 1] ?? 0;
    if (now - latest > 120_000) {
      memoryFallbackStore.delete(k);
    }
  }
  if (memoryFallbackStore.size > MAX_FALLBACK_ENTRIES) {
    const iter = memoryFallbackStore.keys();
    while (memoryFallbackStore.size > MAX_FALLBACK_ENTRIES / 2) {
      const next = iter.next();
      if (next.done) break;
      memoryFallbackStore.delete(next.value);
    }
  }
}

function checkMemoryFallback(kind: RateLimitKind, key: string): RateLimitResult {
  const cfg = LIMITS[kind];
  const now = Date.now();
  pruneMemoryFallback(now);

  const fullKey = `${kind}:${key}`;
  const cutoff = now - cfg.windowMs;
  const recent = (memoryFallbackStore.get(fullKey) || []).filter((ts) => ts > cutoff);

  if (recent.length >= cfg.maxRequests) {
    const oldest = recent[0] ?? now;
    const reset = oldest + cfg.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - now) / 1000));
    memoryFallbackStore.set(fullKey, recent);
    return {
      success: false,
      limit: cfg.maxRequests,
      remaining: 0,
      reset,
      retryAfterSeconds,
    };
  }

  recent.push(now);
  memoryFallbackStore.set(fullKey, recent);
  return {
    success: true,
    limit: cfg.maxRequests,
    remaining: Math.max(0, cfg.maxRequests - recent.length),
    reset: now + cfg.windowMs,
    retryAfterSeconds: 0,
  };
}

/**
 * Checks distributed Upstash sliding-window rate limit when configured,
 * gracefully falling back to a bounded in-memory sliding window otherwise.
 */
export async function checkDistributedRateLimit(
  kind: RateLimitKind,
  identifier: string,
): Promise<RateLimitResult> {
  const limiters = getUpstashLimiters();
  if (!limiters) {
    return checkMemoryFallback(kind, identifier);
  }

  try {
    const res = await limiters[kind].limit(identifier);
    const now = Date.now();
    const retryAfterSeconds = res.success
      ? 0
      : Math.max(1, Math.ceil((res.reset - now) / 1000));
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
      retryAfterSeconds,
    };
  } catch (err) {
    if (!upstashErrorWarned && !isTestEnv()) {
      upstashErrorWarned = true;
      console.warn("⚠️ [RATE LIMIT NOTICE]: Upstash check failed, falling back to memory:", (err as Error).message);
    }
    return checkMemoryFallback(kind, identifier);
  }
}

export function resetMemoryRateLimitStore(): void {
  memoryFallbackStore.clear();
  cachedUpstashLimiters = undefined;
}

export function applyRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.reset / 1000)));
  if (!result.success) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
  }
}

function shouldEnforceInCurrentRequest(req: Request): boolean {
  if (!isTestEnv()) return true;
  return req.headers["x-test-enforce-ratelimit"] === "1";
}

/** General API limiter: 30 requests / 10 seconds per IP */
export const generalRateLimitMiddleware: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!shouldEnforceInCurrentRequest(req)) {
    next();
    return;
  }
  const ip = extractClientIp(req);
  const result = await checkDistributedRateLimit("general", `ip:${ip}`);
  applyRateLimitHeaders(res, result);
  if (!result.success) {
    res.status(429).json({
      error: "تم إرسال طلبات كثيرة جداً في وقت قصير. يرجى الانتظار بضع ثوانٍ والمحاولة مجدداً.",
    });
    return;
  }
  next();
};

/** Sensitive endpoint limiter: 5 requests / minute per IP + route scope */
export function sensitiveRateLimitMiddleware(scope: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!shouldEnforceInCurrentRequest(req)) {
      next();
      return;
    }
    const ip = extractClientIp(req);
    const result = await checkDistributedRateLimit("sensitive", `${scope}:${ip}`);
    applyRateLimitHeaders(res, result);
    if (!result.success) {
      res.status(429).json({
        error: "تجاوزت الحد المسموح من المحاولات. يرجى الانتظار دقيقة واحدة قبل إعادة المحاولة.",
      });
      return;
    }
    next();
  };
}
