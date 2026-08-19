// enerlectra-core/src/core/handlers/redeem.handler.ts

import crypto from 'node:crypto';
import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { createPendingRedemption } from '../../../services/settlement.js';
import { setPendingRedemption } from '../../../services/redemption.js';
import { maskPhone } from '../../../../utils/format.js';
import { logger } from '../../../services/logger.js';

export interface RedeemCommandPayload {
  rawText: string; // e.g. "/redeem 5"
}

export interface RedeemClusterOption {
  id: string;
  label: string;
}

export type RedeemStatus =
  | 'NEED_AMOUNT'
  | 'NEED_PHONE'
  | 'NEED_CLUSTER'
  | 'INITIATED'
  | 'FAILED';

export interface RedeemResult {
  status: RedeemStatus;
  message: string;
  amountPcu?: number;
  phone?: string;
  maskedPhone?: string;
  clusterId?: string;
  reference?: string;
  clusterOptions?: RedeemClusterOption[];
}

/**
 * START_REDEMPTION
 *
 * Previously: handleRedeem(ctx: BotContext)
 */
export class StartRedemptionHandler implements CommandHandler {
  async execute(command: Command): Promise<RedeemResult> {
    const payload = command.payload as RedeemCommandPayload | any;
    const rawText = String(payload.rawText ?? '');

    if (!rawText) {
      return {
        status: 'NEED_AMOUNT',
        message: 'Usage: /redeem <amount>  e.g. /redeem 5',
      };
    }

    const parts = rawText.trim().split(/\s+/);
    const amount = parseFloat(parts[1]);
    if (isNaN(amount) || amount <= 0) {
      return {
        status: 'NEED_AMOUNT',
        message: 'Usage: /redeem <amount>  e.g. /redeem 5',
      };
    }

    const userId = command.context.actorId;

    // 1. Fetch phone number
    const { data: userData } = await supabase
      .from('telegram_users')
      .select('phone_number')
      .eq('user_id', userId)
      .single();

    const phone = userData?.phone_number as string | undefined;
    if (!phone) {
      return {
        status: 'NEED_PHONE',
        message: 'Register your mobile number first: /register',
        amountPcu: amount,
      };
    }

    // 2. Fetch cluster
    const { data: memberData } = await supabase
      .from('cluster_members')
      .select('cluster_id')
      .eq('user_id', userId)
      .maybeSingle();

    const clusterId = memberData?.cluster_id as string | undefined;
    if (!clusterId) {
      // No cluster found – prompt user to join one
      const { data: clusters } = await supabase
        .from('clusters')
        .select('id, name, location')
        .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
        .limit(10);

      if (clusters?.length) {
        const clusterOptions: RedeemClusterOption[] = clusters.map(c => ({
          id: String(c.id),
          label: `${c.name}${c.location ? ` – ${c.location}` : ''}`,
        }));

        // Core returns options; Telegram adapter can build inline_keyboard.
        return {
          status: 'NEED_CLUSTER',
          message: 'Join a community first. Select one below:',
          amountPcu: amount,
          clusterOptions,
        };
      }

      return {
        status: 'NEED_CLUSTER',
        message: 'Join a community first. Use /clusters to browse.',
        amountPcu: amount,
      };
    }

    // 3. Create reference and store pending redemption (in core cache/service)
    const reference = crypto.randomUUID();

    await setPendingRedemption(userId, {
      userId,
      phone,
      amountPcu: amount,
      clusterId,
      reference,
      expiresAt: Date.now() + 60_000,
    });

    // 4. Try to create a pending redemption record in the DB
    try {
      await createPendingRedemption(
        {
          userId,
          clusterId,
          amountPcu: amount,
          phone,
          reference,
          idempotencyKey: reference,
        },
        logger,
      );
    } catch (err) {
      logger.error({ err, userId }, 'Failed to create pending redemption');
      return {
        status: 'FAILED',
        message: 'Unable to initiate redemption. Please try again.',
        amountPcu: amount,
      };
    }

    const masked = maskPhone(phone);

    // 5. Confirm with the user
    const message =
      `*Confirm Redemption*\n\n` +
      `Amount: ${amount} PCU\n` +
      `Recipient: ${masked}\n` +
      `Community: \`${clusterId}\`\n\n` +
      `Reply YES to confirm.`;

    return {
      status: 'INITIATED',
      message,
      amountPcu: amount,
      phone,
      maskedPhone: masked,
      clusterId,
      reference,
    };
  }
}