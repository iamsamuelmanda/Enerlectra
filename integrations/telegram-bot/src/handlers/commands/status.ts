import { BotContext } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { logger } from '../../services/logger';

export async function handleStatus(ctx: BotContext) {
  const { userId } = ctx.state;
  const { data: phoneData } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .single();
  const phone = phoneData?.phone_number ?? null;

  const { data: clusterData } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', userId)
    .maybeSingle();

  const clusterId = clusterData?.cluster_id || ctx.session.clusterId;
  if (!clusterId) {
    return ctx.reply('Not part of a community. Use /clusters to join one.');
  }

  await ctx.reply(
    `*Status*\n\n` +
    `Community\n\`${clusterId}\`\n\n` +
    `Mobile\n${phone ?? 'Not registered - /register'}\n\n` +
    `Send a meter photo to log your next reading.`,
    { parse_mode: 'Markdown' }
  );
}

