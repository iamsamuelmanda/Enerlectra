// actions/property-owner.ts
// Production‑ready handler for all property‑owner inline button actions.
// Uses the middleware‑injected ctx.state (userId, role, orgId) and centralized menus.

import { BotContext } from '../types/context';
import { supabase } from '../lib/supabase';
import { logger } from '../services/logger';

// ─── My Units / Tenants ──────────────────────────────────────────────
export async function handlePropertyUnits(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg');

  const { data: units, error } = await supabase
    .from('customers')
    .select('id, full_name, meter_number, phone')
    .eq('organisation_id', orgId);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch property units');
    return ctx.reply('Unable to load units.');
  }
  if (!units?.length) return ctx.reply('No tenants yet. Import them via the API or add manually.');

  let msg = '*Your Units / Tenants*\n\n';
  units.forEach(u => {
    msg += `🏠 ${u.full_name || 'Unnamed'} | Meter: ${u.meter_number || 'N/A'} | ${u.phone || ''}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ─── Meter Readings ──────────────────────────────────────────────────
export async function handlePropertyReadings(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg');

  // Show recent meter readings for this property (from events or transactions)
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('organisation_id', orgId)
    .in('category', ['meter', 'reading'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch meter readings');
    return ctx.reply('Unable to load readings.');
  }
  if (!events?.length) return ctx.reply('No meter readings recorded yet.');

  let msg = '*Recent Meter Readings*\n\n';
  events.forEach(e => {
    const kwh = e.payload?.reading_kwh ?? 'N/A';
    const date = new Date(e.created_at).toLocaleDateString('en-GB');
    msg += `⚡ ${kwh} kWh — ${date}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ─── Collections (payments received / missed) ────────────────────────
export async function handlePropertyCollections(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg');

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('organisation_id', orgId)
    .in('category', ['payment'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch collections');
    return ctx.reply('Unable to load collections.');
  }
  if (!events?.length) return ctx.reply('No collections recorded yet.');

  let msg = '*Collection Status*\n\n';
  events.forEach(e => {
    const emoji = e.event_type === 'received' ? '✅' : e.event_type === 'missed' ? '❌' : '⏳';
    const period = e.payload?.period || '';
    const amount = e.payload?.amount || '?';
    msg += `${emoji} ${period} — K${amount}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ─── Tenant Invite Link ──────────────────────────────────────────────
export async function handlePropertyInvite(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg');

  // Generate a deep link that brings new tenants into the organisation
  const inviteLink = `https://t.me/EnerlectraBot?start=org_${orgId.slice(0,8)}`;
  await ctx.reply(
    `*Invite Tenants*\n\nShare this link with your tenants:\n\`${inviteLink}\`\n\nWhen they open it, they will be automatically linked to your property.`,
    { parse_mode: 'Markdown' }
  );
}

// ─── Settings ────────────────────────────────────────────────────────
export async function handlePropertySettings(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  await ctx.reply(
    `*Property Settings*\n\nOrganisation: ${orgId ? `\`${orgId.slice(0,8)}\`` : 'Not linked'}\n\nUse /linkorg <name> to link your organisation.`,
    { parse_mode: 'Markdown' }
  );
}

