import type { BotContext } from '../../types/context';
import { getBotState } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { logger } from '../../services/logger';

export async function handleLinkOrg(ctx: BotContext): Promise<void> {
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply('Usage: /linkorg <organisation>\n\nExample: /linkorg renwasol');
    return;
  }

  const state = getBotState(ctx);
  if (!state) {
    await ctx.reply('Authentication error. Please try /start first.');
    return;
  }

  const slug = ctx.message.text.replace(/^\/linkorg(@\w+)?\s*/, '').trim().toLowerCase();
  if (!slug) {
    await ctx.reply('Usage: /linkorg <organisation>\n\nExample: /linkorg renwasol');
    return;
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();

  if (orgError || !org) {
    logger.warn({ orgError, slug }, 'Organisation lookup failed');
    await ctx.reply(
      `Organisation "${slug}" not found. Available examples: renwasol, ds-solar, boarding-house`
    );
    return;
  }

  const { error: updateError } = await supabase
    .from('telegram_users')
    .update({
      organization_id: org.id,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', state.userId);

  if (updateError) {
    logger.error({ updateError, userId: state.userId, orgId: org.id }, 'Failed to link organisation');
    await ctx.reply('Failed to link organisation. Please try again.');
    return;
  }

  Object.assign(ctx.state, { ...state, orgId: org.id });

  await ctx.reply(
    `*Linked to ${org.name}*\n\nYou can now use /support to ask questions about your account.`,
    { parse_mode: 'Markdown' }
  );
}


