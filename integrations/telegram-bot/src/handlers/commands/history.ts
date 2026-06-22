import { BotContext } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { logger } from '../../services/logger';

export async function handleHistory(ctx: BotContext) {
  const { userId } = ctx.state;
  const { data: readings, error } = await supabase
    .from('meter_readings')
    .select('reading_kwh, meter_type, captured_at, delta_kwh')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(5);

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch reading history');
    return ctx.reply('Unable to load history. Please try again.');
  }

  if (!readings?.length) {
    return ctx.reply('No readings yet.');
  }

  let totalExport = 0;
  let msg = `*Recent Submissions*\n\n`;

  for (const reading of readings) {
    const date = new Date(reading.captured_at).toLocaleDateString('en-GB');
    const delta = reading.delta_kwh
      ? `${reading.delta_kwh > 0 ? '+' : ''}${reading.delta_kwh} kWh`
      : 'baseline';

    const sanitizedMeterType = reading.meter_type.replace(/_/g, ' ');

    msg += `${reading.reading_kwh} kWh (${sanitizedMeterType}) - ${delta} - ${date}\n`;

    if (
      reading.delta_kwh &&
      reading.delta_kwh > 0 &&
      (reading.meter_type === 'solar_export' || reading.meter_type === 'solar_generation')
    ) {
      totalExport += reading.delta_kwh;
    }
  }

  if (totalExport > 0) {
    msg += `\nTotal export: ${totalExport.toFixed(2)} kWh\nSubmit regularly to maximize earnings.`;
  }

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

