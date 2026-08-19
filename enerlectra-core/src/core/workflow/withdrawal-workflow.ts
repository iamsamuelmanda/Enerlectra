import { supabase } from '../../infrastructure/supabase.js';
import { logger } from '../services/logger.js';
import { createPendingRedemption, requestLencoPayout } from '../services/settlement.js';
import { setPendingRedemption } from '../services/redemption.js';
import crypto from 'node:crypto';

export interface WithdrawalResult {
  success: boolean;
  reference: string;
  amountPcu: number;
  phone: string;
  clusterId: string;
  error?: string;
}

/**
 * Calculates withdrawal amount options based on available balance.
 * Returns half and full amount for UI button display.
 */
export function calculateWithdrawalOptions(availableBalance: number): { half: number; full: number } {
  const half = Math.floor(availableBalance * 0.5);
  const full = availableBalance;
  return { half, full };
}

export class WithdrawalWorkflow {
  static async execute(userId: string, amount: number): Promise<WithdrawalResult> {
    try {
      // Get user phone number
      const { data: userData, error: userError } = await supabase
        .from('telegram_users')
        .select('phone_number')
        .eq('user_id', userId)
        .single();

      if (userError || !userData?.phone_number) {
        throw new Error('User phone number not registered');
      }

      const phone = userData.phone_number;

      // Get user cluster
      const { data: memberData, error: memberError } = await supabase
        .from('cluster_members')
        .select('cluster_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError || !memberData?.cluster_id) {
        throw new Error('User not in a community');
      }

      const clusterId = memberData.cluster_id;
      const reference = crypto.randomUUID();

      // Set pending redemption
      await setPendingRedemption(userId, {
        userId,
        phone,
        amountPcu: amount,
        clusterId,
        reference,
        expiresAt: Date.now() + 60_000,
      });

      // Create pending redemption
      await createPendingRedemption(
        {
          userId,
          clusterId,
          amountPcu: amount,
          phone,
          reference,
          idempotencyKey: reference,
        },
        logger
      );

      return {
        success: true,
        reference,
        amountPcu: amount,
        phone,
        clusterId,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Withdrawal workflow failed');
      throw error;
    }
  }
}