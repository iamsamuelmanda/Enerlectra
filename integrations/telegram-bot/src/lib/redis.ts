// integrations/telegram-bot/src/lib/redis.ts
import { Redis } from '@upstash/redis';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const REDIS_KEY_PREFIX = 'enerlectra:bot';
export const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
export const PENDING_TTL_SECONDS = 60 * 10;      // 10 minutes