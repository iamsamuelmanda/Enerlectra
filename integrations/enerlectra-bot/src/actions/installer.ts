// actions/installer.ts
// Handlers for installer‑specific buttons.

import { BotContext } from '../types/context';
import { InstallerService } from 'enerlectra-core/src/core/services/installer.service';
import { logger } from 'enerlectra-core/src/core/services/logger';
import { logMetric } from 'enerlectra-core/src/core/services/metrics';

// ─── My Installs ──────────────────────────────────────────────────────
export async function handleInstallerInstalls(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg.');

  const installerService = new InstallerService();
  const assets = await installerService.getInstalls(orgId);

  if (!assets) return ctx.reply('Unable to load installs.');

  if (!assets.length) return ctx.reply('No installations recorded yet.');

  let msg = '*Your Installations*\n\n';
  assets.forEach(a => {
    msg += `🔧 ${a.type} – S/N: ${a.serial_number || 'N/A'} – ${a.status}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await installerService.logInstallerInstallsViewed(ctx.state.userId, orgId);
}

// ─── Faults ───────────────────────────────────────────────────────────
export async function handleInstallerFaults(ctx: BotContext) {
  await ctx.answerCbQuery();
  const { orgId } = ctx.state;
  if (!orgId) return ctx.reply('Link your organisation first with /linkorg.');

  const installerService = new InstallerService();
  const faults = await installerService.getFaults(orgId);

  if (!faults) return ctx.reply('Unable to load faults.');

  if (!faults.length) return ctx.reply('No faults reported yet.');

  let msg = '*Reported Faults*\n\n';
  faults.forEach(f => {
    const date = new Date(f.created_at).toLocaleDateString('en-GB');
    msg += `⚠️ ${f.event_type} – ${date}\n`;
  });
  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await installerService.logInstallerFaultsViewed(ctx.state.userId, orgId);
}

// ─── Report Fault ─────────────────────────────────────────────────────
export async function handleInstallerReportFault(ctx: BotContext) {
  await ctx.answerCbQuery();
  // Could start a Redis state machine to capture fault details, but for now we guide the user.
  await ctx.reply(
    'To report a fault, use the /support command with a description of the issue.\n' +
    'Example: /support Battery voltage low at site XYZ'
  );
  const installerService = new InstallerService();
  await installerService.logInstallerReportFaultClicked(ctx.state.userId, ctx.state.orgId);
}

