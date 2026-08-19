// services/redemption.ts
// Production‑ready pending redemption store using Redis.
// Used by /redeem command and tenant redeem button flow.

import { redis, PENDING_TTL_SECONDS } from '../../infrastructure/redis.js';
import { logger } from './logger.js';

export interface PendingRedemption {
  userId: string;
  phone: string;
  amountPcu: number;
  clusterId: string;
  reference: string;
  expiresAt: number;
}

const PREFIX = 'pending_redemption';

/**
 * Save a pending redemption in Redis with automatic expiry.
 */
export async function setPendingRedemption(
  userId: string,
  redemption: PendingRedemption
): Promise<void> {
  const key = `${PREFIX}:${userId}`;
  try {
    await redis.set(key, JSON.stringify(redemption), {
      ex: PENDING_TTL_SECONDS,
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to store pending redemption');
    throw new Error('Unable to save redemption request');
  }
}

/**
 * Retrieve a pending redemption for a user, or null if none exists or it has expired.
 */
export async function getPendingRedemption(
  userId: string
): Promise<PendingRedemption | null> {
  const key = `${PREFIX}:${userId}`;
  try {
    const raw = await redis.get<string>(key);
    if (!raw) return null;

    const parsed: PendingRedemption = JSON.parse(raw);

    // Validate shape
    if (
      typeof parsed !== 'object' ||
      !parsed.expiresAt ||
      !parsed.userId
    ) {
      logger.warn({ userId }, 'Malformed pending redemption payload');
      await redis.del(key);
      return null;
    }

    // Check expiry
    if (Date.now() > parsed.expiresAt) {
      await redis.del(key);
      return null;
    }

    return parsed;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to retrieve pending redemption');
    // Clean up to avoid stuck keys
    await redis.del(key);
    return null;
  }
}

/**
 * Delete a pending redemption after it has been processed or cancelled.
 */
export async function clearPendingRedemption(userId: string): Promise<void> {
  const key = `${PREFIX}:${userId}`;
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to clear pending redemption');
  }
}

