import { supabase } from '../../infrastructure/supabase.js';
import { logger } from './logger.js';
import { backfillPCUWalletForUser } from './pcuMinting.js';

export interface UserBalance {
  balance_pcu: number;
  total_minted_pcu: number;
}

/**
 * Fetches the PCU balance for a given user.
 * If no balance exists, it attempts to backfill the wallet.
 */
export async function getUserBalance(userId: string): Promise<UserBalance | null> {
  let { data, error } = await supabase
    .from('pcu_balances')
    .select('balance_pcu, total_minted_pcu')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    try {
      await backfillPCUWalletForUser(userId);
      const retry = await supabase
        .from('pcu_balances')
        .select('balance_pcu, total_minted_pcu')
        .eq('user_id', userId)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    } catch (err) {
      logger.error({ err, userId }, 'PCU backfill failed');
    }
  }

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch user balance');
    throw error;
  }

  return data;
}

/**
 * Fetches only the available PCU balance for a given user.
 * Used by transport drivers for quick balance checks.
 */
export async function getUserAvailableBalance(userId: string): Promise<number> {
  const balance = await getUserBalance(userId);
  return balance?.balance_pcu ?? 0;
}
