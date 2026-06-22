// handlers/commands/read.ts
import { BotContext } from '../../types/context';
import { processManualReading } from '../../services/manual-reading';
import { logger } from '../../services/logger';

/**
 * /read <kWh> [type]
 * Manually submit a meter reading without a photo.
 */
export async function handleRead(ctx: BotContext) {
    if (!ctx.message || !('text' in ctx.message)) return;
  const parts = ctx.message.text.split(' ');
  const kwh = parseFloat(parts[1]);
  const meterType = (parts[2] as any) || 'unknown';

  if (isNaN(kwh) || kwh <= 0) {
    return ctx.reply('Usage: /read <kWh> [type]  e.g. /read 152.61 solar_export');
  }

  const { userId } = ctx.state;

  try {
    const resultMsg = await processManualReading(userId, kwh, meterType, ctx);
    await ctx.reply(resultMsg, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error({ err, userId }, 'Manual reading failed');
    await ctx.reply('An error occurred while saving your reading. Please try again.');
  }
}

