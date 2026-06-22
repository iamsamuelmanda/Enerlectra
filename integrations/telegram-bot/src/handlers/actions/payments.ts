// src/handlers/actions/payments.ts
import type { BotContext } from '../../types/context';
import { getInvoices, createPaymentRequest, subscribeTenantToPlan } from '../../services/payments';
import { supabase } from '../../lib/supabase';

export async function showPaymentsMenu(ctx: BotContext) {
  await ctx.answerCbQuery();
  const orgId = ctx.state.orgId;
  if (!orgId) return ctx.reply('No organisation linked.');

  const invoices = await getInvoices(orgId);
  if (!invoices.length) return ctx.reply('No invoices yet.');

  let msg = '*Recent Invoices*\n\n';
  invoices.forEach((inv: any) => {
    msg += `• ${inv.description || 'Invoice'} – K${inv.amount} – ${inv.status}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

export async function showSubscriptionOptions(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { data: plans } = await supabase.from('plans').select('*');
  if (!plans?.length) return ctx.reply('No subscription plans available yet.');

  const keyboard = plans.map((plan: any) => [
    { text: `${plan.name} – K${plan.price}/month`, callback_data: `sub_plan:${plan.id}` }
  ]);
  await ctx.reply('*Choose a plan*', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function handlePlanSelection(ctx: BotContext) {
  await ctx.answerCbQuery();
  const planId = (ctx.callbackQuery as any).data.split(':')[1];
  await ctx.reply(`You selected plan ${planId}. A payment request will be sent to your mobile number.`);
}