// handlers/commands/redeem.ts
import { BotContext } from '../../types/context';
import { supabase } from '../../lib/supabase';
import { createPendingRedemption } from '../../services/settlement';
import { setPendingRedemption } from '../../services/redemption';
import { maskPhone } from '../../utils/format';
import crypto from 'node:crypto';
import { logger } from '../../services/logger';

/**
 * /redeem <amount>
 * Start the cash‑out flow for a tenant.
 */
export async function handleRedeem(ctx: BotContext) {
  if (!ctx.message || !('text' in ctx.message)) return;
  const parts = ctx.message.text.split(' ');
  const amount = parseFloat(parts[1]);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Usage: /redeem <amount>  e.g. /redeem 5');
  }

  const { userId } = ctx.state;

  // 1. Fetch phone number
  const { data: userData } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .single();
  const phone = userData?.phone_number;
  if (!phone) return ctx.reply('Register your mobile number first: /register');

  // 2. Fetch cluster
  const { data: memberData } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', userId)
    .maybeSingle();
  const clusterId = memberData?.cluster_id;
  if (!clusterId) {
    // No cluster found – prompt user to join one
    const { data: clusters } = await supabase
      .from('clusters')
      .select('id, name, location')
      .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
      .limit(10);
    if (clusters?.length) {
      const keyboard = clusters.map(c => [
        { text: `${c.name}${c.location ? ` – ${c.location}` : ''}`, callback_data: `join:${c.id}` },
      ]);
      return ctx.reply('Join a community first. Select one below:', {
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    return ctx.reply('Join a community first. Use /clusters to browse.');
  }

  // 3. Create reference and store pending redemption
  const reference = crypto.randomUUID();
  await setPendingRedemption(userId, {
    userId,
    phone,
    amountPcu: amount,
    clusterId,
    reference,
    expiresAt: Date.now() + 60_000,
  });

  // 4. Try to create a pending redemption record in the DB (optional, but keeps consistency)
  try {
    await createPendingRedemption(
      {
        userId,
        clusterId,
        amountPcu: amount,
        phone,
        reference,
        idempotencyKey: reference,
      },
      logger
    );
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create pending redemption');
    return ctx.reply('Unable to initiate redemption. Please try again.');
  }

  // 5. Confirm with the user
  await ctx.reply(
    `*Confirm Redemption*\n\n` +
    `Amount: ${amount} PCU\n` +
    `Recipient: ${maskPhone(phone)}\n` +
    `Community: \`${clusterId}\`\n\n` +
    `Reply YES to confirm.`,
    { parse_mode: 'Markdown' }
  );
}

