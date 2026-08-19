// enerlectra-core/src/core/handlers/handlers/commands/token.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';

export interface GenerateTokenResult {
  token?: string;
  meterNumber?: string;
  amount?: string;
  message: string;
}

/**
 * GENERATE_TOKEN
 *
 * Retrieves the most recent prepaid token for the user.
 * Previously handled by the legacy bot's token lookup flow.
 */
export class GenerateTokenHandler implements CommandHandler {
  async execute(command: Command): Promise<GenerateTokenResult> {
    const userId = command.context.actorId;

    // Resolve phone number to find transactions
    const { data: user } = await supabase
      .from('telegram_users')
      .select('phone_number')
      .eq('user_id', userId)
      .single();

    const phone = user?.phone_number;
    if (!phone) {
      return {
        message: 'Register your mobile number first: /register',
      };
    }

    const searchPattern = `%${phone}%`;
    const { data: txns, error } = await supabase
      .from('transactions')
      .select('*')
      .or(`customer_phone.ilike.${searchPattern},meter_number.ilike.${searchPattern}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch token');
      return { message: 'Unable to load your token right now. Please try again.' };
    }

    const txn = txns?.[0];
    if (!txn) {
      return { message: 'No token found. Make a payment first to receive a token.' };
    }

    if (txn.status === 'FAILED') {
      return { message: 'Your last token request failed. Please contact support.' };
    }

    if (!txn.token) {
      return { message: 'No token has been generated yet for your latest transaction.' };
    }

    return {
      token: txn.token,
      meterNumber: txn.meter_number,
      amount: txn.amount ? String(txn.amount) : undefined,
      message:
        `*Your Token*\n\n` +
        `Meter: \`${txn.meter_number}\`\n` +
        `Token: \`${txn.token}\`\n` +
        (txn.amount ? `Amount: K${txn.amount}\n` : ''),
    };
  }
}