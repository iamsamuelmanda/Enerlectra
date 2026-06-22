import type { BotContext } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { logger } from '../../services/logger';
import { resolveUserId, getPhoneNumber } from '../../services/resolve-user';
import { getUserRole } from '../../services/identity';
import { sendRoleHome, sendRoleSelection } from '../../views/home';

export async function handleStart(ctx: BotContext): Promise<void> {
  const startPayload = (ctx as unknown as { startPayload?: string }).startPayload;
  const telegramId = ctx.from!.id.toString();

  const userId = await resolveUserId(telegramId, {
    username: ctx.from!.username,
    first_name: ctx.from!.first_name,
    last_name: ctx.from!.last_name,
  });

  if (startPayload) {
    try {
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const clusterId = decoded
        .split('|')
        .find((part) => part.startsWith('c:'))
        ?.replace('c:', '');

      if (clusterId) {
        ctx.session.clusterId = clusterId;

        const { error: joinError } = await supabase
          .from('cluster_members')
          .upsert({ cluster_id: clusterId, user_id: userId }, { onConflict: 'cluster_id,user_id' });

        if (joinError) {
          logger.error({ joinError, userId, clusterId }, 'Start payload cluster join failed');
          await ctx.reply('Welcome! We had trouble linking your community. Use /clusters to join manually.');
          return;
        }

        await ctx.reply(
          `*Welcome to Enerlectra*\n\nCommunity: \`${clusterId}\`\n\nSend a meter photo to log a reading.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    } catch {
      // Ignore malformed start payloads
    }
  }

  const role = await getUserRole(userId);
  if (!role) {
    await sendRoleSelection(ctx);
    return;
  }

  const phone = await getPhoneNumber(userId);
  await sendRoleHome(ctx);

  if (!phone) {
    await ctx.reply('Tip: Register your mobile number with /register for payment and token lookups.');
  }
}


