// actions/organization.ts
// Production‑ready handler for all operator org‑management button actions.
// Uses the middleware‑injected ctx.state (userId, role, orgId) and centralized menus.

import { BotContext } from '../types/context';
import { supabase } from '../lib/supabase';
import { redis } from '../lib/redis';
import { logger } from 'enerlectra-core/src/core/services/logger';
import { logMetric } from 'enerlectra-core/src/core/services/metrics';

// ─── Customer List ────────────────────────────────────────────────────
export async function handleOrgCustomers(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('No organisation linked. Use /linkorg first.');

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, full_name, meter_number, phone')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch customers');
    return ctx.reply('Unable to load customers.');
  }

  if (!customers?.length) {
    return ctx.reply('No customers yet. Add one with the button below.');
  }

  let msg = '*Your Customers*\n\n';
  customers.forEach(c => {
    msg += `👤 ${c.full_name || 'Unnamed'} | Meter: ${c.meter_number || 'N/A'} | ${c.phone || ''}\n`;
  });

  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await logMetric('customer_list_viewed', ctx.state.userId, orgId);
}

// ─── Energy Feed ──────────────────────────────────────────────────────
export async function handleOrgEnergyFeed(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('No organisation linked.');

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch events');
    return ctx.reply('Unable to load events.');
  }

  if (!events?.length) return ctx.reply('No energy events recorded yet.');

  let msg = '*Recent Events*\n\n';
  events.forEach(e => {
    const date = new Date(e.created_at).toLocaleDateString('en-GB');
    msg += `📌 ${e.category}/${e.event_type} — ${date}\n`;
  });

  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await logMetric('event_feed_viewed', ctx.state.userId, orgId);
}

// ─── Alerts List ──────────────────────────────────────────────────────
export async function handleOrgAlerts(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('No organisation linked.');

  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch alerts');
    return ctx.reply('Unable to load alerts.');
  }

  if (!alerts?.length) return ctx.reply('No active alerts. 🎉');

  let msg = '*Active Alerts*\n\n';
  alerts.forEach(a => {
    msg += `🚨 ${a.type}: ${a.message}\n`;
  });

  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await logMetric('alerts_viewed', ctx.state.userId, orgId);
}

// ─── Operator Settings ───────────────────────────────────────────────
export async function handleOrgSettings(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  await ctx.reply(
    `*Settings*\n\nOrganisation: ${orgId ? `\`${orgId.slice(0,8)}\`` : 'Not linked'}\n\nUse /linkorg <name> to link your organisation.`,
    { parse_mode: 'Markdown' }
  );
}

// ─── Add Customer (start Redis-based flow) ───────────────────────────
export async function handleAddCustomer(ctx: BotContext) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from!.id.toString();
  await redis.del(`demo_state:${telegramId}`);   // ← CLEAR STALE STATE
  await redis.set(`demo_state:${telegramId}`, 'add_customer_meter', { ex: 120 });
  await ctx.reply('Enter the customer\'s meter number:');
}