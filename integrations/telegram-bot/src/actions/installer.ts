// actions/installer.ts
// Handlers for installer‑specific buttons.

import { BotContext } from '../types/context';
import { supabase } from '../lib/supabase';
import { logger } from '../services/logger';
import { logMetric } from '../services/metrics';

// ─── My Installs ──────────────────────────────────────────────────────
export async function handleInstallerInstalls(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg.');

  // Query assets installed by this organisation (assuming they are stored in assets table)
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, type, serial_number, status')
    .eq('organisation_id', orgId)
    .limit(10);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch installs');
    return ctx.reply('Unable to load installs.');
  }

  if (!assets?.length) return ctx.reply('No installations recorded yet.');

  let msg = '*Your Installations*\n\n';
  assets.forEach(a => {
    msg += `🔧 ${a.type} – S/N: ${a.serial_number || 'N/A'} – ${a.status}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await logMetric('installer_installs_viewed', ctx.state.userId, orgId);
}

// ─── Faults ───────────────────────────────────────────────────────────
export async function handleInstallerFaults(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg.');

  // Look for fault events logged by this installer
  const { data: faults, error } = await supabase
    .from('events')
    .select('*')
    .eq('organisation_id', orgId)
    .in('event_type', ['fault_reported', 'battery_fault', 'overload'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error({ error, orgId }, 'Failed to fetch faults');
    return ctx.reply('Unable to load faults.');
  }

  if (!faults?.length) return ctx.reply('No faults reported yet.');

  let msg = '*Reported Faults*\n\n';
  faults.forEach(f => {
    const date = new Date(f.created_at).toLocaleDateString('en-GB');
    msg += `⚠️ ${f.event_type} – ${date}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await logMetric('installer_faults_viewed', ctx.state.userId, orgId);
}

// ─── Report Fault ─────────────────────────────────────────────────────
export async function handleInstallerReportFault(ctx: BotContext) {
  await ctx.answerCbQuery();
  // Could start a Redis state machine to capture fault details, but for now we guide the user.
  await ctx.reply(
    'To report a fault, use the /support command with a description of the issue.\n' +
    'Example: /support Battery voltage low at site XYZ'
  );
  await logMetric('installer_report_fault_clicked', ctx.state.userId, ctx.state.orgId);
}

