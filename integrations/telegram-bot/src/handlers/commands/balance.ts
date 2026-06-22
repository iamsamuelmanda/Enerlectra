import { BotContext } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { logger } from '../../services/logger';
import { backfillPCUWalletForUser } from '../../services/pcuMinting';

export async function handleBalance(ctx: BotContext) {
  const { userId } = ctx.state;
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
    return ctx.reply('Unable to load your PCU wallet right now. Please try again.');
  }

  if (!data) {
    return ctx.reply('No PCU wallet found. Submit an export reading first.');
  }

  await ctx.reply(
    `*PCU Balance*\n\n` +
    `Available\n${data.balance_pcu} PCU\n\n` +
    `Lifetime earned\n${data.total_minted_pcu} PCU\n\n` +
    `/redeem <amount> to cash out.`,
    { parse_mode: 'Markdown' }
  );
}

