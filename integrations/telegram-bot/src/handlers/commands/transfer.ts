import { BotContext } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { logger } from '../../services/logger';
import { transferPCU } from '../../services/pcuTransfer';

export async function handleTransfer(ctx: BotContext) {
  if (!ctx.message || !('text' in ctx.message)) return;
  const parts = ctx.message.text.split(' ');
  const amount = parseFloat(parts[1]);
  const targetUsername = parts[2]?.replace('@', '');

  if (!amount || amount <= 0 || !targetUsername) {
    return ctx.reply('Usage: /transfer <amount> <@username>');
  }

  const { userId } = ctx.state;
  const result = await transferPCU({
    fromUserId: userId,
    toUsername: targetUsername,
    amountPcu: amount,
    logger,
  });

  if (!result.success) {
    return ctx.reply(result.errorMessage || 'Transfer failed.');
  }

  await ctx.reply(`Transferred ${amount} PCU to @${targetUsername}`);
}

