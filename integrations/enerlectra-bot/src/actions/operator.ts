// actions/operator.ts
// Handlers for the operator‑specific dashboard buttons.

import { BotContext } from '../types/context';
import { OperatorService } from 'enerlectra-core/src/core/services/operator.service';
import { logger } from 'enerlectra-core/src/core/services/logger';
import { logMetric, trackTransactionInvestigation } from 'enerlectra-core/src/core/services/metrics';

// ─── Transaction Dashboard ──────────────────────────────────────────
export async function handleTransactionDashboard(ctx: BotContext) {
  await ctx.answerCbQuery();

  const { orgId } = ctx.state;
  const operatorService = new OperatorService();
  const txns = await operatorService.getTransactions(orgId);

  if (!txns) return ctx.reply('Unable to load transactions.');

  const delivered = txns.filter(t => t.status === 'DELIVERED').length;
  const pending = txns.filter(t => t.status === 'PENDING' || t.status === 'PROCESSING').length;
  const failed = txns.filter(t => t.status === 'FAILED').length;

  let msg = `*Transactions*\n✅ Delivered: ${delivered}\n⏳ Pending: ${pending}\n❌ Failed: ${failed}\n\n_Tap for details:_\n`;

  const txButtons = txns.slice(0, 5).map(t => {
    const emoji = t.status === 'DELIVERED' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
    return [{ text: `${emoji} K${t.amount} - ${t.meter_number}`, callback_data: `txn_detail_${t.id}` }];
  });

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [...txButtons, [{ text: '🔄 Refresh', callback_data: 'demo_operator' }]],
    },
  });

  await operatorService.logTransactionDashboardView(ctx.state.userId, orgId);
}

// ─── Failed Transactions ────────────────────────────────────────────
export async function handleFailedTransactions(ctx: BotContext) {
  await ctx.answerCbQuery();

  const { orgId } = ctx.state;
  const operatorService = new OperatorService();
  const failed = await operatorService.getFailedTransactions(orgId);

  if (!failed) return ctx.reply('Unable to load failed transactions.');
  if (!failed.length) return ctx.reply('No failed transactions. 🎉');

  let alertMsg = '*⚠️ Failed Transactions*\n\n';
  failed.forEach(t => {
    alertMsg += `❌ Meter ${t.meter_number} — K${t.amount} — ${t.failure_reason}\n`;
  });

  const failedButtons = failed.map(t => [
    { text: `🔧 Fix Meter ${t.meter_number} (K${t.amount})`, callback_data: `txn_detail_${t.id}` },
  ]);

  await ctx.reply(alertMsg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [...failedButtons, [{ text: '📋 View All Failed', callback_data: 'demo_failed' }]],
    },
  });

  // Notify operator channel
  const operatorChatId = process.env.OPERATOR_CHAT_ID;
  if (operatorChatId) {
    await ctx.telegram.sendMessage(
      operatorChatId,
      `⚠️ *ALERT*: ${failed.length} failed transaction(s) require attention.\n\n` +
      `Failed meters: ${failed.map(t => t.meter_number).join(', ')}\n\n` +
      `_Open the Enerlectra bot to investigate._`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  await operatorService.logFailedTransactionsViewed(ctx.state.userId, orgId);
}

// ─── Search (start Redis state) ─────────────────────────────────────
export async function startSearch(ctx: BotContext) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from!.id.toString();
  const operatorService = new OperatorService();
  await operatorService.startSearch(telegramId);
  await ctx.reply('🔎 *Search Transaction*\n\nEnter a meter number, phone number, or transaction ID.', {
    parse_mode: 'Markdown',
  });
}

// ─── Customer View (start Redis state) ──────────────────────────────
export async function startCustomerView(ctx: BotContext) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from!.id.toString();
  const operatorService = new OperatorService();
  await operatorService.startCustomerView(telegramId);
  await ctx.reply('👁️ *Customer View*\n\nEnter a meter number to see recent transactions.', {
    parse_mode: 'Markdown',
  });
}

// ─── Recent Activity ────────────────────────────────────────────────
export async function handleRecentActivity(ctx: BotContext) {
  await ctx.answerCbQuery();

  const { orgId } = ctx.state;
  const operatorService = new OperatorService();
  const txns = await operatorService.getTransactions(orgId);

  if (!txns) return ctx.reply('Unable to load recent activity.');

  let msg = '*Recent Activity*\n\n';
  txns.forEach(t => {
    const emoji = t.status === 'DELIVERED' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
    msg += `${emoji} K${t.amount} — Meter ${t.meter_number} — ${t.status}\n`;
  });

  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await operatorService.logRecentActivityViewed(ctx.state.userId, orgId);
}

// ─── Transaction Detail ─────────────────────────────────────────────
export async function handleTransactionDetail(ctx: BotContext) {
  await ctx.answerCbQuery();
  const txnId = (ctx.callbackQuery as any).data.split('_').pop();
  if (!txnId) return ctx.reply('Invalid transaction ID.');

  const operatorService = new OperatorService();
  const txn = await operatorService.getTransactionDetail(txnId);

  if (!txn) return ctx.reply('Transaction not found.');

  const emoji = txn.status === 'DELIVERED' ? '✅' : txn.status === 'FAILED' ? '❌' : '⏳';
  let msg = `*Transaction Detail*\n\nID: \`TXN-${txn.id.slice(0,8).toUpperCase()}\`\nStatus: ${emoji} ${txn.status}\nAmount: K${txn.amount}\nMeter: ${txn.meter_number}\nCustomer: ${txn.customer_phone}\nDate: ${new Date(txn.created_at).toLocaleDateString('en-GB')}\n`;
  if (txn.token) msg += `Token: \`${txn.token}\`\n`;
  if (txn.failure_reason) msg += `Reason: ${txn.failure_reason}\n`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });

  if (ctx.state.orgId) {
    await operatorService.trackTransactionInvestigation(ctx.state.userId, ctx.state.orgId, txn.id);
  }
}
