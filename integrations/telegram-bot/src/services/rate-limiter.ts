// integrations/telegram-bot/src/services/rate-limiter.ts
//
// WHAT CHANGED:
//  ✅ Replaced `ioredis` with `@upstash/redis` — the only Redis client
//     @upstash/ratelimit actually accepts (ioredis has an incompatible
//     evalsha signature that causes the TS2322 errors you saw)
//
// ENV VARS (when using Upstash):
//   UPSTASH_REDIS_REST_URL   — from your Upstash console
//   UPSTASH_REDIS_REST_TOKEN — from your Upstash console
//
// Install (if not already):
//   npm install @upstash/redis @upstash/ratelimit

import { Ratelimit } from '@upstash/ratelimit';
import { Redis }     from '@upstash/redis';
import type { Logger } from 'pino';

// ====================== IN-MEMORY FALLBACK ======================
// Used when no Upstash credentials are configured.
// Survives restarts only within the same process — fine for dev,
// but does NOT share state across Render instances.
class InMemoryRateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  async limit(key: string, max: number, windowSec: number) {
    const now   = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now > entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return { success: true, remaining: max - 1, reset: now + windowSec * 1000 };
    }
    if (entry.count >= max) {
      return { success: false, remaining: 0, reset: entry.resetAt };
    }
    entry.count++;
    return { success: true, remaining: max - entry.count, reset: entry.resetAt };
  }
}

// ====================== TYPES ======================
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

type UserTier = 'free' | 'paid';

// ====================== RATE LIMITER ======================
export class OCRRateLimiter {
  private freeLimiter: Ratelimit | InMemoryRateLimiter;
  private paidLimiter: Ratelimit | InMemoryRateLimiter;

  constructor(
    private logger?: Logger,
    // Pass both url + token, or omit to fall back to in-memory.
    upstash?: { url: string; token: string }
  ) {
    // Also accept env vars directly if upstash arg not provided
    const url   = upstash?.url   ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = upstash?.token ?? process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      const redis = new Redis({ url, token });

      this.freeLimiter = new Ratelimit({
        redis,
        limiter:   Ratelimit.slidingWindow(10, '1 h'),
        analytics: true,
        prefix:    'ocr_free',
      });

      this.paidLimiter = new Ratelimit({
        redis,
        limiter:   Ratelimit.slidingWindow(100, '1 h'),
        analytics: true,
        prefix:    'ocr_paid',
      });

      logger?.info('OCR rate limiter using Upstash Redis');
    } else {
      this.freeLimiter = new InMemoryRateLimiter();
      this.paidLimiter = new InMemoryRateLimiter();
      logger?.warn('OCR rate limiter using in-memory store (not suitable for multi-instance production)');
    }
  }

  async check(userId: string, userTier: UserTier = 'free'): Promise<RateLimitResult> {
    const limiter = userTier === 'free' ? this.freeLimiter : this.paidLimiter;
    const key     = `ocr:${userId}`;

    try {
      let result: { success: boolean; remaining: number; reset: number };

      if (limiter instanceof Ratelimit) {
        result = await limiter.limit(key);
      } else {
        const max = userTier === 'free' ? 10 : 100;
        result    = await limiter.limit(key, max, 3600);
      }

      return {
        allowed:            result.success,
        remaining:          result.remaining,
        resetAt:            new Date(result.reset),
        retryAfterSeconds:  result.success
          ? undefined
          : Math.ceil((result.reset - Date.now()) / 1000),
      };
    } catch (err) {
      this.logger?.error({ err, userId, userTier }, 'Rate limiter error — allowing request');
      // Fail open: better to allow a request than to block the bot entirely
      return { allowed: true, remaining: 1, resetAt: new Date() };
    }
  }
}