// enerlectra-core/src/core/handlers/balance.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';
import { backfillPCUWalletForUser } from '../../../services/pcuMinting.js';

export interface BalanceResult {
  available?: number;
  lifetime?: number;
  message: string;
}

/**
 * SHOW_BALANCE
 *
 * Previously: handleBalance(ctx: BotContext)
 */
export class ShowBalanceHandler implements CommandHandler {
  async execute(command: Command): Promise<BalanceResult> {
    const userId = command.context.actorId;

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
      } catch (err: unknown) {
        logger.error({ err, userId }, 'PCU wallet backfill failed');
      }
    }

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch PCU balance');
      return {
        message: 'Unable to load your PCU wallet right now. Please try again.',
      };
    }

    if (!data) {
      return {
        message: 'No PCU wallet found. Submit an export reading first.',
      };
    }

    return {
      available: data.balance_pcu,
      lifetime: data.total_minted_pcu,
      message:
        `*PCU Balance*\n\n` +
        `Available\n${data.balance_pcu} PCU\n\n` +
        `Lifetime earned\n${data.total_minted_pcu} PCU\n\n` +
        `/redeem <amount> to cash out.`,
    };
  }
}