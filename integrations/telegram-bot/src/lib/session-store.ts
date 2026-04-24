// integrations/telegram-bot/src/lib/session-store.ts
import { redis, REDIS_KEY_PREFIX, SESSION_TTL_SECONDS } from './redis';
import type { SessionStore } from 'telegraf';

export interface SessionData {
  clusterId?: string;
  awaitingPhone?: boolean;
}

function sessionKey(chatId: number | string, userId?: number | string): string {
  return `${REDIS_KEY_PREFIX}:session:${chatId}:${userId ?? 'anon'}`;
}

export function createRedisSessionStore<T extends SessionData>(): SessionStore<T> {
  return {
    async get(key: string): Promise<T | undefined> {
      const data = await redis.get<string>(key);
      if (!data) return undefined;
      try {
        return JSON.parse(data) as T;
      } catch {
        return undefined;
      }
    },

    async set(key: string, value: T): Promise<void> {
      await redis.set(key, JSON.stringify(value), { ex: SESSION_TTL_SECONDS });
    },

    async delete(key: string): Promise<void> {
      await redis.del(key);
    },
  };
}

export { sessionKey };