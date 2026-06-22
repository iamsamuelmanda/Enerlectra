// actions/tenant.ts
// Production-ready handler for all tenant-specific inline button actions.
// Uses the middleware-injected ctx.state (userId, role, orgId) and centralized menus.

import { BotContext } from '../types/context';
import { supabase } from '../lib/supabase';
import { redis } from '../lib/redis';
import { logger } from '../services/logger';
import { backfillPCUWalletForUser, mintPCUForExportReading } from '../services/pcuMinting';
import { transferPCU } from '../services/pcuTransfer';
import { getLiveExchangeRate } from '../services/exchange';
import { createPendingRedemption, requestLencoPayout } from '../services/settlement';
import { setPendingRedemption, clearPendingRedemption } from '../services/redemption';
import { maskPhone, normalizePhoneNumber } from '../utils/format';
import { tenantHomeKeyboard } from '../views/menus';
import crypto from 'node:crypto';

// ─── Submit Meter Reading ────────────────────────────────────────────
export async function handleTenantSubmitReading(ctx: BotContext) {
  await ctx.answerCbQuery();
  await ctx.reply(
    'Send a photo of your meter, or use /read <kWh> [type] for manual entry.',
    { parse_mode: 'Markdown' }
  );
}

// ─── PCU Balance ─────────────────────────────────────────────────────
export async function handleTenantBalance(ctx: BotContext) {
  await ctx.answerCbQuery();
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
    } catch (err) {
      logger.error({ err, userId }, 'PCU backfill failed');
    }
  }

  if (error || !data) {
    return ctx.reply('Unable to load your PCU wallet. Please try again.');
  }

  await ctx.reply(
    `*PCU Balance*\n\nAvailable: ${data.balance_pcu} PCU\nLifetime earned: ${data.total_minted_pcu} PCU\n\n/redeem <amount> to cash out.`,
    { parse_mode: 'Markdown' }
  );
}

// ─── Reading History ─────────────────────────────────────────────────
export async function handleTenantHistory(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { userId } = ctx.state;

  const { data: readings, error } = await supabase
    .from('meter_readings')
    .select('reading_kwh, meter_type, captured_at, delta_kwh')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(5);

  if (error) {
    logger.error({ error, userId }, 'History fetch failed');
    return ctx.reply('Unable to load history.');
  }
  if (!readings?.length) return ctx.reply('No readings yet.');

  let totalExport = 0;
  let msg = '*Recent Submissions*\n\n';
  for (const r of readings) {
    const date = new Date(r.captured_at).toLocaleDateString('en-GB');
    const delta = r.delta_kwh
      ? `${r.delta_kwh > 0 ? '+' : ''}${r.delta_kwh} kWh`
      : 'baseline';
    const type = r.meter_type.replace(/_/g, ' ');
    msg += `${r.reading_kwh} kWh (${type}) – ${delta} – ${date}\n`;

    if (r.delta_kwh && r.delta_kwh > 0 && (r.meter_type === 'solar_export' || r.meter_type === 'solar_generation')) {
      totalExport += r.delta_kwh;
    }
  }
  if (totalExport > 0) msg += `\nTotal export: ${totalExport.toFixed(2)} kWh`;
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ─── Redeem PCU (button-driven flow) ─────────────────────────────────
export async function handleTenantRedeem(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { userId } = ctx.state;

  const { data: balance } = await supabase
    .from('pcu_balances')
    .select('balance_pcu')
    .eq('user_id', userId)
    .maybeSingle();

  const available = balance?.balance_pcu ?? 0;
  if (available <= 0) return ctx.reply('No PCU available to cash out yet.');

  const half = Math.floor(available * 0.5);
  await ctx.reply(
    `*Cash Out*\n\nAvailable: ${available} PCU\n\nHow much do you want to cash out?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `${half} PCU`, callback_data: `redeem_amt:${half}` },
            { text: `All ${available} PCU`, callback_data: `redeem_amt:${available}` },
          ],
          [{ text: 'Cancel', callback_data: 'redeem_cancel' }],
        ],
      },
    }
  );
}

// Called when a specific amount is chosen
export async function handleRedeemAmount(ctx: BotContext) {
  await ctx.answerCbQuery();
  const amount = parseFloat((ctx.callbackQuery as any).data.split(':')[1]);
  if (isNaN(amount) || amount <= 0) return ctx.reply('Invalid amount.');

  const { userId } = ctx.state;
  const { data: userData } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .single();
  const phone = userData?.phone_number;
  if (!phone) return ctx.reply('Register your mobile number first: /register');

  const { data: memberData } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', userId)
    .maybeSingle();
  const clusterId = memberData?.cluster_id;
  if (!clusterId) return ctx.reply('Join a community first. Use /clusters.');

  const reference = crypto.randomUUID();

  await setPendingRedemption(userId, {
    userId,
    phone,
    amountPcu: amount,
    clusterId,
    reference,
    expiresAt: Date.now() + 60_000,
  });

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

  await ctx.reply(
    `*Confirm Redemption*\n\n` +
    `Amount: ${amount} PCU\n` +
    `Recipient: ${maskPhone(phone)}\n` +
    `Community: \`${clusterId}\`\n\n` +
    `Reply YES to confirm.`,
    { parse_mode: 'Markdown' }
  );
}

// Cancel the redeem flow
export async function handleRedeemCancel(ctx: BotContext) {
  await ctx.answerCbQuery();
  await ctx.reply('Cash out cancelled.');
}

// ─── Register Mobile Number ──────────────────────────────────────────
export async function handleTenantRegister(ctx: BotContext) {
  await ctx.answerCbQuery();
  ctx.session.awaitingPhone = true;
  await ctx.reply(
    'Reply with your mobile number:\n`+260XXXXXXXXX` or `097XXXXXXX`',
    { parse_mode: 'Markdown' }
  );
}

// ─── Browse Communities ──────────────────────────────────────────────
export async function handleTenantClusters(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { data: clusters, error } = await supabase
    .from('clusters')
    .select('id, name, location')
    .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
    .limit(10);

  if (error) {
    logger.error({ error }, 'Failed to fetch clusters');
    return ctx.reply('Unable to load communities.');
  }
  if (!clusters?.length) return ctx.reply('No communities available.');

  const keyboard = clusters.map(c => [
    { text: `${c.name}${c.location ? ` – ${c.location}` : ''}`, callback_data: `join:${c.id}` },
  ]);
  await ctx.reply(`*Energy Communities*\n\nSelect one to join:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

// ─── Back to home ─────────────────────────────────────────────────────
export async function backToTenantHome(ctx: BotContext) {
  await ctx.answerCbQuery();
  // You may need to recheck phone presence for conditional keyboard
  const hasPhone = /* check DB or session */ true; // adjust as needed
  await ctx.reply('*Tenant Dashboard*', {
    parse_mode: 'Markdown',
    ...tenantHomeKeyboard(hasPhone),
  });
}

