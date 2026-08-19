// actions/tenant.ts
// Production-ready handler for all tenant-specific inline button actions.
// Uses the middleware-injected ctx.state (userId, role, orgId) and centralized menus.

import { BotContext } from '../types/context';
import { logger } from '../../../../enerlectra-core/src/core/services/logger';
import { getUserBalance, getUserAvailableBalance } from '../../../../enerlectra-core/src/core/services/balance.service';
import { backfillPCUWalletForUser, mintPCUForExportReading } from '../../../../enerlectra-core/src/core/services/pcuMinting';
import { transferPCU } from '../../../../enerlectra-core/src/core/services/pcuTransfer';
import { createPendingRedemption, requestLencoPayout } from '../../../../enerlectra-core/src/core/services/settlement';
import { setPendingRedemption, clearPendingRedemption } from '../../../../enerlectra-core/src/core/services/redemption';
import { maskPhone, normalizePhoneNumber } from '../utils/format';
import { tenantHomeKeyboard } from '../views/menus';
import { calculateWithdrawalOptions } from '../../../../enerlectra-core/src/core/workflow/withdrawal-workflow';
import { checkUserHasPhone } from '../../../../enerlectra-core/src/core/services/bot-state';

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

  try {
    const data = await getUserBalance(userId);

    if (!data) {
      return ctx.reply('Unable to load your PCU wallet. Please try again.');
    }

    await ctx.reply(
      `*PCU Balance*\n\nAvailable: ${data.balance_pcu} PCU\nLifetime earned: ${data.total_minted_pcu} PCU\n\n/redeem <amount> to cash out.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to handle tenant balance');
    return ctx.reply('Unable to load your PCU wallet. Please try again.');
  }
}

// ─── Reading History ─────────────────────────────────────────────────
import { getUserHistory } from '../../../../enerlectra-core/src/core/services/history.service';

export async function handleTenantHistory(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { userId } = ctx.state;

  try {
    const readings = await getUserHistory(userId);
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
  } catch (error) {
    logger.error({ error, userId }, 'History fetch failed');
    return ctx.reply('Unable to load history.');
  }
}

// ─── Redeem PCU (button-driven flow) ─────────────────────────────────
export async function handleTenantRedeem(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { userId } = ctx.state;

  const available = await getUserAvailableBalance(userId);
  if (available <= 0) return ctx.reply('No PCU available to cash out yet.');

  const { half, full } = calculateWithdrawalOptions(available);
  await ctx.reply(
    `*Cash Out*\n\nAvailable: ${available} PCU\n\nHow much do you want to cash out?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `${half} PCU`, callback_data: `redeem_amt:${half}` },
            { text: `All ${full} PCU`, callback_data: `redeem_amt:${full}` },
          ],
          [{ text: 'Cancel', callback_data: 'redeem_cancel' }],
        ],
      },
    }
  );
}

// Called when a specific amount is chosen
import { WithdrawalWorkflow } from '../../../../enerlectra-core/src/core/workflow/withdrawal-workflow';

export async function handleWithdrawAmount(ctx: BotContext) {
  await ctx.answerCbQuery();
  const amount = parseFloat((ctx.callbackQuery as any).data.split(':')[1]);
  if (isNaN(amount) || amount <= 0) return ctx.reply('Invalid amount.');

  const { userId } = ctx.state;

  try {
    const result = await WithdrawalWorkflow.execute(userId, amount);

    await ctx.reply(
      `*Confirm Withdrawal*\n\n` +
      `Amount: ${result.amountPcu} PCU\n` +
      `Recipient: ${maskPhone(result.phone)}\n` +
      `Community: \`${result.clusterId}\`\n\n` +
      `Reply YES to confirm.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to initiate withdrawal');
    return ctx.reply('Unable to initiate withdrawal. Please try again.');
  }
}

// Cancel the redeem flow
export async function handleRedeemCancel(ctx: BotContext) {
  await ctx.answerCbQuery();
  await ctx.reply('Cash out cancelled.');
}

// ─── Register Mobile Number ──────────────────────────────────────────
export async function handleTenantRegister(ctx: BotContext) {
  await ctx.answerCbQuery();
  // Session state is managed by the adapter layer, not in core business logic
  // The adapter will handle conversational state based on this UI prompt
  await ctx.reply(
    'Reply with your mobile number:\n`+260XXXXXXXXX` or `097XXXXXXX`',
    { parse_mode: 'Markdown' }
  );
}

// ─── Browse Communities ──────────────────────────────────────────────
import { getUserClusters } from '../../../../enerlectra-core/src/core/services/cluster.service';

export async function handleTenantClusters(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { userId } = ctx.state;

  try {
    const clusters = await getUserClusters(userId);
    if (!clusters?.length) return ctx.reply('No communities available.');

    const keyboard = clusters.map(c => [
      { text: `${c.name}${c.location ? ` – ${c.location}` : ''}`, callback_data: `join:${c.id}` },
    ]);
    await ctx.reply(`*Energy Communities*\n\nSelect one to join:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch clusters');
    return ctx.reply('Unable to load communities.');
  }
}

// ─── Back to home ─────────────────────────────────────────────────────
export async function backToTenantHome(ctx: BotContext) {
  await ctx.answerCbQuery();
  // Use transport-agnostic core service to check phone presence
  const { userId } = ctx.state;
  const hasPhone = await checkUserHasPhone(userId);
  await ctx.reply('*Tenant Dashboard*', {
    parse_mode: 'Markdown',
    ...tenantHomeKeyboard(hasPhone),
  });
}

