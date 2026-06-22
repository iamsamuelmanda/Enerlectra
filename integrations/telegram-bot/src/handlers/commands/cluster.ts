import { BotContext } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { logger } from '../../services/logger';

export async function handleClusters(ctx: BotContext) {
  const { data: clusters, error } = await supabase
    .from('clusters')
    .select('id, name, location')
    .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
    .limit(10);

  if (error) {
    logger.error({ error }, 'Failed to fetch clusters');
    return ctx.reply('Unable to load communities. Please try again.');
  }

  if (!clusters?.length) {
    return ctx.reply('No communities available. Contact your administrator.');
  }

  const keyboard = clusters.map((cluster) => [
    {
      text: `${cluster.name}${cluster.location ? ` - ${cluster.location}` : ''}`,
      callback_data: `join:${cluster.id}`,
    },
  ]);

  await ctx.reply(`*Energy Communities*\n\nSelect one to join:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

