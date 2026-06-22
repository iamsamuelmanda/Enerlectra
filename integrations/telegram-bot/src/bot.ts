import dotenv from 'dotenv';
dotenv.config();

import { Context, Telegraf, session } from 'telegraf';
import { message } from 'telegraf/filters';
import express from 'express';
import { supabase } from './lib/supabase';
import { logger } from './services/logger';
import { resolveUserId, getPhoneNumber, resolveCluster, promptForCluster, replyOrEdit } from './services/resolve-user';
import { injectSession } from './middleware/session-injector';
import type { BotContext, BotSession } from './types/context';
import { redis, PENDING_TTL_SECONDS, REDIS_KEY_PREFIX } from './lib/redis';
import { createRedisSessionStore } from './lib/session-store';
import crypto from 'node:crypto';

// OCR / reading services
import { MeterOcrResult, MeterType, readMeterOCR, setLogger as setOcrLogger } from './services/ocr';
import { validateReading } from './services/validation';
import { calculateValue, type ValueEstimate } from './services/tariff-calculator';
import { OCRRateLimiter } from './services/rate-limiter';
import { createPendingRedemption, requestLencoPayout } from './services/settlement';
import { computeSettlementScore, type SettlementScoreResult } from './services/settlementScore';
import { decideSettlement, type SettlementDecision } from './services/settlementDecision';
import { backfillPCUWalletForUser, mintPCUForExportReading } from './services/pcuMinting';
import { transferPCU } from './services/pcuTransfer';

// Imported handlers (all extracted commands & actions)
import { handleRead } from './handlers/commands/read';
import {
  resetmeterCommand,
  resetmeterConfirmCallback,
  resetmeterTypeCallback,
} from './handlers/commands/resetmeter';
import { handleSupport, handleFreeformSupport } from './handlers/commands/support';
import { handleLinkOrg } from './handlers/commands/linkorg';
import { handleStart } from './handlers/commands/start';
import { handleRoleSelection } from './actions/role';
import { startQuickSupport } from './actions/support';

// Operator / Organisation actions
import {
  handleOrgCustomers,
  handleOrgEnergyFeed,
  handleOrgAlerts,
  handleOrgSettings,
  handleAddCustomer,
} from './actions/organization';

// Operator visibility actions
import {
  handleTransactionDashboard,
  handleFailedTransactions,
  startSearch,
  startCustomerView,
  handleRecentActivity,
  handleTransactionDetail,
} from './actions/operator';

// Payments & subscriptions
import {
  showPaymentsMenu,
  showSubscriptionOptions,
  handlePlanSelection,
} from './handlers/actions/payments';

// Installer actions
import {
  handleInstallerInstalls,
  handleInstallerFaults,
  handleInstallerReportFault,
} from './actions/installer';


// ─── Environment ──────────────────────────────────────────────────────
const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing environment variable ${key}`);
    process.exit(1);
  }
}
setOcrLogger(logger);
const rateLimiter = new OCRRateLimiter(logger);

// ─── Express server ──────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Ellie is awake and monitoring the grid.'));

// ─── Redis prefixes ──────────────────────────────────────────────────
const PENDING_READING_PREFIX = `${REDIS_KEY_PREFIX}:pending_reading`;
const PENDING_REDEMPTION_PREFIX = `${REDIS_KEY_PREFIX}:pending_redemption`;
const SELECTED_CLUSTER_PREFIX = `${REDIS_KEY_PREFIX}:selected_cluster`;

// ─── Types ────────────────────────────────────────────────────────────
interface PendingClusterReading {
  stage: 'awaiting_cluster';
  fileId: string;
  chatId: number;
  expiresAt: number;
}
interface PendingMeterTypeReading {
  stage: 'awaiting_meter_type';
  imageUrl: string;
  ocrResult: MeterOcrResult;
  chatId: number;
  expiresAt: number;
}
type PendingReading = PendingClusterReading | PendingMeterTypeReading;

interface ReadingRecord {
  id: string;
  user_id: string;
  cluster_id: string;
  unit_id: string | null;
  meter_type: string;
  reading_kwh: number;
  photo_url: string | null;
  ocr_confidence: number | null;
  validated: boolean;
  captured_at: string;
  reporting_period: string;
  source: string;
  delta_kwh: number | null;
  reading_key: string;
  status: string;
  metadata: Record<string, unknown> | null;
}
interface LocalValidationResult {
  valid: boolean;
  reason?: string;
  delta?: number;
  prevKwh?: number | null;
  flag?: 'first_reading' | 'after_reset' | 'normal' | 'meter_rollover';
  visualMismatch?: boolean;
  imageHash?: string;
  hammingDistance?: number;
  hoursSinceLastReading?: number | null;
  maxAllowed?: number | null;
}
interface ValueResult {
  message: string;
  valueEstimate?: ValueEstimate;
  payoutRef?: string;
  payoutStatus?: string;
  payoutAmount?: number;
}
interface PendingRedemption {
  userId: string;
  phone: string;
  amountPcu: number;
  clusterId: string;
  reference: string;
  expiresAt: number;
}

// ─── Bot instance ─────────────────────────────────────────────────────
const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);
bot.use(session({
  store: createRedisSessionStore<BotSession>(),
  getSessionKey: (ctx) => ctx.from?.id.toString(),
  defaultSession: (): BotSession => ({}),
}));
bot.use(injectSession);

// ─── Helper functions ─────────────────────────────────────────────────
async function getPendingReading(telegramId: string): Promise<PendingReading | null> {
  const key = `${PENDING_READING_PREFIX}:${telegramId}`;
  const data = await redis.get<PendingReading | string>(key);
  if (!data) return null;
  const parsed: PendingReading = typeof data === 'string' ? JSON.parse(data) : data;
  if (typeof parsed !== 'object' || !('expiresAt' in parsed)) {
    logger.warn({ telegramId, key }, 'Malformed pending reading payload');
    await redis.del(key);
    return null;
  }
  if (Date.now() > parsed.expiresAt) {
    await redis.del(key);
    return null;
  }
  return parsed;
}
async function setPendingReading(telegramId: string, value: PendingReading): Promise<void> {
  await redis.set(`${PENDING_READING_PREFIX}:${telegramId}`, JSON.stringify(value), { ex: PENDING_TTL_SECONDS });
}
async function clearPendingReading(telegramId: string): Promise<void> {
  await redis.del(`${PENDING_READING_PREFIX}:${telegramId}`);
}
async function getSelectedCluster(userId: string): Promise<string | null> {
  const key = `${SELECTED_CLUSTER_PREFIX}:${userId}`;
  const data = await redis.get<string | { clusterId?: string }>(key);
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && typeof data.clusterId === 'string') return data.clusterId;
  logger.warn({ userId, key, dataType: typeof data }, 'Invalid selected cluster payload');
  await redis.del(key);
  return null;
}
async function setSelectedCluster(userId: string, clusterId: string): Promise<void> {
  await redis.set(`${SELECTED_CLUSTER_PREFIX}:${userId}`, clusterId);
}
async function getPendingRedemption(userId: string): Promise<PendingRedemption | null> {
  const key = `${PENDING_REDEMPTION_PREFIX}:${userId}`;
  const data = await redis.get<PendingRedemption | string>(key);
  if (!data) return null;
  const parsed: PendingRedemption = typeof data === 'string' ? JSON.parse(data) : data;
  if (typeof parsed !== 'object' || !('expiresAt' in parsed)) {
    await redis.del(key);
    return null;
  }
  if (Date.now() > parsed.expiresAt) {
    await redis.del(key);
    return null;
  }
  return parsed;
}
async function setPendingRedemption(userId: string, value: PendingRedemption): Promise<void> {
  await redis.set(`${PENDING_REDEMPTION_PREFIX}:${userId}`, JSON.stringify(value), { ex: PENDING_TTL_SECONDS });
}
async function clearPendingRedemption(userId: string): Promise<void> {
  await redis.del(`${PENDING_REDEMPTION_PREFIX}:${userId}`);
}
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function normalizePhoneNumber(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '');
  let n = cleaned;
  if (n.startsWith('0')) n = '+260' + n.slice(1);
  if (n.startsWith('260')) n = '+' + n;
  return /^\+260\d{9}$/.test(n) ? n : null;
}
function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}
function dbErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '42P01') return 'Database table missing. Run the migration script in Supabase.';
  return `Query failed: ${error.message || 'unknown error'}`;
}
function generateReadingKey(userId: string, clusterId: string, meterType: string, period: string, readingKwh: number): string {
  const raw = `${userId}:${clusterId}:${meterType}:${period}:${readingKwh.toFixed(2)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}
async function getLiveExchangeRate(): Promise<number> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) throw new Error('EXCHANGE_RATE_API_KEY not configured');
  const axios = (await import('axios')).default;
  const res = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
  const rate = res.data?.conversion_rates?.ZMW;
  if (!rate) throw new Error('Invalid exchange rate response');
  return rate;
}

// ─── Core processing (photo pipeline) ─────────────────────────────────
async function handleReadingValueAndPayout(
  ctx: BotContext, userId: string, clusterId: string,
  reading: ReadingRecord, validation: LocalValidationResult, requestId: string,
  decision: SettlementDecision
): Promise<ValueResult> {
  const isExport = reading.meter_type === 'solar_export' || reading.meter_type === 'solar_generation';
  const phone = await getPhoneNumber(userId);
  let result: ValueResult = {
    message: isExport
      ? '\nExport baseline recorded. PCU earnings start on your next submission. Check /balance.'
      : '\nImport reading logged. No payout for consumption.',
  };
  if (isExport) {
    try {
      await mintPCUForExportReading(reading);
      if (validation.delta && validation.delta > 0) result.message = '\nPCUs minted for export. Check /balance.';
    } catch (err) {
      logger.error({ err, readingId: reading.id, userId }, 'PCU minting failed');
      result.message = validation.delta && validation.delta > 0
        ? '\nExport reading saved, but PCU wallet update is pending.'
        : '\nExport baseline recorded, but wallet setup is pending.';
    }
  }
  if (decision !== 'INSTANT') {
    if (decision === 'REVIEW') result.message += '\n\nStatus: Under review — high confidence reading required for instant payout.';
    else if (decision === 'REJECT') result.message = '\nReading rejected by settlement scoring.';
    return result;
  }
  if (!validation.delta || validation.delta <= 0) return result;
  try {
    const value = await calculateValue(validation.delta, reading.meter_type as MeterType, userId, clusterId, requestId, logger, { consentGiven: true });
    result.valueEstimate = value;
    if (!phone) {
      result.message = `\nValue: K${value.netValue.toFixed(2)}\nRegister your number to receive payouts:\n/register`;
      return result;
    }
    if (value.netValue < 1) {
      result.message = `\nValue: K${value.netValue.toFixed(2)}\nPayout below K1 threshold. Accumulated for next settlement.`;
      return result;
    }
    try {
      const payout = await requestLencoPayout({
        userId, clusterId, readingId: reading.id,
        amount: value.netValue, phoneNumber: phone,
        narration: `Enerlectra credit - ${validation.delta.toFixed(2)} kWh`,
      }, logger);
      result.payoutRef = payout.reference;
      result.payoutStatus = payout.status;
      result.payoutAmount = value.netValue;
      result.message = `\nValue: K${value.netValue.toFixed(2)}` +
        `\nPayout: K${value.netValue.toFixed(2)}` +
        `\nTo: ${maskPhone(phone)}` +
        `\nRef: ${payout.reference}`;
    } catch (err) {
      logger.error({ err }, 'Auto-payout failed');
      result.message = `\nValue: K${value.netValue.toFixed(2)}\nPayout failed. Support will follow up within 24h.`;
    }
    return result;
  } catch (err) {
    logger.error({ err }, 'Value calculation failed');
    result.message = '\nValue calculation unavailable.';
    return result;
  }
}

function formatReadingMessage(
  currentKwh: number, prevKwh: number | null, delta: number | null,
  meterType: MeterType, period: string, clusterId: string,
  valueResult: ValueResult, isFirstReading: boolean, isAfterReset: boolean,
  visualMismatch?: boolean, scoreResult?: SettlementScoreResult, decision?: SettlementDecision
): string {
  const periodLabel = formatPeriod(period);
  if (isFirstReading || isAfterReset || delta === null) {
    const title = isAfterReset ? 'Baseline reset' : 'Baseline recorded';
    const subtitle = isAfterReset ? 'New baseline after meter reset.' : 'First reading for this meter.';
    return `*${title}*\n\nMeter\n${currentKwh.toFixed(2)} kWh\n\nPrevious\n-\n\n${subtitle}\nEarnings calculated on next submission.\n\nCommunity\n\`${clusterId}\`\nPeriod\n${periodLabel}`;
  }
  const deltaSign = delta > 0 ? '+' : '';
  const isExport = meterType === 'solar_export' || meterType === 'solar_generation';
  const usageLabel = isExport ? 'Export' : 'Usage';
  let msg = `*Reading accepted*\n\nMeter\n${currentKwh.toFixed(2)} kWh\n\nPrevious\n${prevKwh!.toFixed(2)} kWh\n\n${usageLabel}\n${deltaSign}${delta.toFixed(2)} kWh\n`;
  msg += valueResult.message;
  msg += `\n\nCommunity\n\`${clusterId}\`\nPeriod\n${periodLabel}`;
  if (valueResult.payoutRef) msg += '\n\nStatus: Settled';
  else if (isExport && delta > 0) msg += '\n\nNext\n/redeem to cash out';
  else if (!isExport) msg += '\n\nNext\n/history to track consumption';
  if (visualMismatch) msg += '\n\nNote: Meter image differs from previous submission. Contact support if you changed meters.';
  if (scoreResult && decision && decision !== 'REJECT') {
    msg += `\n\n*Score*: ${scoreResult.score.toFixed(2)}\nPhysics: ${scoreResult.breakdown.physics.toFixed(2)} | Temporal: ${scoreResult.breakdown.temporal.toFixed(2)} | Trust: ${scoreResult.breakdown.trust.toFixed(2)}`;
    if (decision === 'REVIEW') msg += '\n⚠️ Under review — support will verify.';
  } else if (decision === 'REJECT') {
    msg += '\n\n⚠️ Reading rejected by settlement scoring.';
  }
  return msg;
}

async function processAndSaveReading(
  ctx: BotContext, userId: string, telegramId: string,
  ocrResult: MeterOcrResult, imageUrl: string, requestId: string, editMessageId?: number
): Promise<void> {
  const { clusterId, unitId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await replyOrEdit(ctx, 'Join a community first. Use /clusters.', undefined, editMessageId);
    await promptForCluster(ctx);
    return;
  }
  try {
    const validation = await validateReading({ userId, clusterId, newKwh: ocrResult.kwh!, confidence: ocrResult.confidence, meterType: ocrResult.meterType, imageUrl, requestId, logger });
    if (!validation.valid) {
      await clearPendingReading(telegramId);
      await replyOrEdit(ctx, `Rejected\n\n${validation.reason}`, undefined, editMessageId);
      return;
    }
    const v = validation as unknown as LocalValidationResult;
    const timeSinceLastReadingSec = (v.hoursSinceLastReading ?? 1) * 3600;
    const meterRules: Record<string, number> = { grid_import: 2.5, solar_import: 1.5, solar_export: 20, solar_generation: 20, generator: 5, unit_submeter: 1, unknown: 2.5 };
    const maxAllowedKwh = (meterRules[ocrResult.meterType] ?? 2.5) * (v.hoursSinceLastReading ?? 1);
    const scoreResult = computeSettlementScore({ deltaKwh: v.delta ?? 0, timeSinceLastReadingSec, maxAllowedKwh, userTrustScore: 0.6, deviceConsistencyScore: 1.0 });
    const estimatedValue = (v.delta ?? 0) * 65;
    const decision = decideSettlement(scoreResult.score, estimatedValue);
    logger.info({ requestId, userId, score: scoreResult.score, decision, breakdown: scoreResult.breakdown }, 'Settlement score computed');
    const period = getCurrentPeriod();
    const readingKey = generateReadingKey(userId, clusterId, ocrResult.meterType, period, ocrResult.kwh!);
    const metadata: Record<string, unknown> = {};
    if (v.imageHash) metadata.image_hash = v.imageHash;
    if (v.hammingDistance !== undefined) metadata.hamming_distance = v.hammingDistance;
    if (v.visualMismatch) metadata.visual_mismatch = true;
    const { data: reading, error: insertError } = await supabase.from('meter_readings').insert({
      user_id: userId, cluster_id: clusterId, unit_id: unitId,
      reading_kwh: ocrResult.kwh, meter_type: ocrResult.meterType,
      photo_url: imageUrl, ocr_confidence: ocrResult.confidence,
      validated: true, captured_at: new Date().toISOString(),
      reporting_period: period, source: 'telegram',
      delta_kwh: v.delta ?? 0, reading_key: readingKey, status: 'active', metadata,
    }).select('*').single();
    if (insertError) throw insertError;
    if (!reading) throw new Error('Insert succeeded but no reading returned');
    const valueResult = await handleReadingValueAndPayout(ctx, userId, clusterId, reading as ReadingRecord, v, requestId, decision);
    const isFirstReading = v.flag === 'first_reading';
    const isAfterReset = v.flag === 'after_reset';
    const messageText = formatReadingMessage(ocrResult.kwh!, v.prevKwh ?? null, v.delta ?? null, ocrResult.meterType, period, clusterId, valueResult, isFirstReading, isAfterReset, v.visualMismatch, scoreResult, decision);
    await clearPendingReading(telegramId);
    await replyOrEdit(ctx, messageText, { parse_mode: 'Markdown' }, editMessageId);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ error: err.message }, 'Processing error');
    await clearPendingReading(telegramId);
    await replyOrEdit(ctx, `Failed to save reading: ${err.message}`, undefined, editMessageId);
  }
}

async function promptForMeterTypeSelection(
  ctx: BotContext, telegramId: string, imageUrl: string,
  ocrResult: MeterOcrResult, editMessageId?: number
): Promise<void> {
  await setPendingReading(telegramId, { stage: 'awaiting_meter_type', imageUrl, ocrResult, chatId: ctx.chat?.id ?? 0, expiresAt: Date.now() + PENDING_TTL_SECONDS * 1000 });
  const sourceNote = ocrResult.source === 'claude_vision' ? '\n_AI vision reading - please verify carefully._' : '';
  const text = `Reading detected: ${ocrResult.kwh} kWh\nConfidence: ${(ocrResult.confidence * 100).toFixed(0)}%${sourceNote}\n\nWhat type of reading is this?`;
  await replyOrEdit(ctx, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: 'Grid Import', callback_data: 'metertype:grid_import' }, { text: 'Solar Export', callback_data: 'metertype:solar_export' }]] },
  }, editMessageId);
}

async function processPhotoFile(
  ctx: BotContext, userId: string, telegramId: string,
  fileId: string, editMessageId?: number
): Promise<void> {
  const requestId = crypto.randomUUID();
  try {
    const file = await ctx.telegram.getFile(fileId);
    if (!file || !file.file_path) throw new Error('Telegram file path missing');
    const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const ocrResult = await readMeterOCR(imageUrl, { requestId });
    if (ocrResult.status === 'manual_required') {
      await clearPendingReading(telegramId);
      await replyOrEdit(ctx, `Automatic reading unavailable.\n\nEnter manually:\n/read <value>  e.g. /read 152.61`, { parse_mode: 'Markdown' }, editMessageId);
      return;
    }
    if (ocrResult.status === 'failed' || !ocrResult.kwh) {
      await clearPendingReading(telegramId);
      await replyOrEdit(ctx, `Could not read the meter.\n\n${ocrResult.error || 'No numbers detected'}\n\nTips:\n- Hold phone steady, parallel to meter\n- Ensure display is lit\n- Avoid glare\n\nOr enter manually: /read <value>`, { parse_mode: 'Markdown' }, editMessageId);
      return;
    }
    if (ocrResult.meterType === 'unknown') {
      await promptForMeterTypeSelection(ctx, telegramId, imageUrl, ocrResult, editMessageId);
      return;
    }
    if (ocrResult.status === 'review' || ocrResult.confidence < 0.8) {
      const sourceNote = ocrResult.source === 'claude_vision' ? '\n_AI vision reading - please verify carefully._' : '';
      await replyOrEdit(ctx, `Reading detected: ${ocrResult.kwh} kWh\nType: ${ocrResult.meterType.replace(/_/g, ' ')}\nConfidence: ${(ocrResult.confidence * 100).toFixed(0)}%${sourceNote}\n\nSaving...`, { parse_mode: 'Markdown' }, editMessageId);
    }
    await processAndSaveReading(ctx, userId, telegramId, ocrResult, imageUrl, requestId, editMessageId);
  } catch (err) {
    logger.error({ err, telegramId }, 'Photo handler error');
    await clearPendingReading(telegramId);
    await replyOrEdit(ctx, 'An unexpected error occurred. Please try again.', undefined, editMessageId);
  }
}

// ─── Commands & actions ──────────────────────────────────────────────
bot.start((ctx: any) => handleStart(ctx));
bot.command('support', (ctx: any) => handleSupport(ctx));
bot.command('linkorg', (ctx: any) => handleLinkOrg(ctx));
bot.command('read', (ctx: any) => handleRead(ctx));
bot.command('resetmeter', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  await resetmeterCommand(ctx, userId, logger);
});
bot.command('privacy', async (ctx) => {
  await ctx.reply(
    `*Enerlectra Privacy Policy*\n\n` +
    `Data collected: Telegram ID, username, phone number, meter readings, location.\n\n` +
    `Why: To process energy settlements and deliver payouts.\n\n` +
    `Storage: Encrypted via Supabase. Never sold to third parties.\n\n` +
    `Contact: support@enerlectra.com`,
    { parse_mode: 'Markdown' }
  );
});
bot.command('help', async (ctx) => {
  await ctx.reply(
    `*Commands*\n\n` +
    `Send a meter photo - Submit a reading\n` +
    `/read <kWh> [type] - e.g. /read 150 solar_export\n` +
    `/balance - Check PCU balance\n` +
    `/status - View linked cluster\n` +
    `/register - Add mobile number\n` +
    `/history - View past submissions\n` +
    `/redeem <amount> - Cash out PCU\n` +
    `/transfer <amount> <@user> - Send PCU\n` +
    `/clusters - Browse communities\n` +
    `/resetmeter - Reset meter after replacement\n` +
    `/support - Ask Enerlectra support\n` +
    `/linkorg - Link to your organisation`,
    { parse_mode: 'Markdown' }
  );
});
bot.command('balance', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  let { data, error } = await supabase.from('pcu_balances').select('balance_pcu, total_minted_pcu').eq('user_id', userId).maybeSingle();
  if (!data) {
    try {
      await backfillPCUWalletForUser(userId);
      const retry = await supabase.from('pcu_balances').select('balance_pcu, total_minted_pcu').eq('user_id', userId).maybeSingle();
      data = retry.data; error = retry.error;
    } catch (err) { logger.error({ err, userId }, 'PCU wallet backfill failed'); }
  }
  if (error) { logger.error({ error, userId }, 'Failed to fetch PCU balance'); return ctx.reply('Unable to load your PCU wallet right now.'); }
  if (!data) return ctx.reply('No PCU wallet found. Submit an export reading first.');
  await ctx.reply(
    `*PCU Balance*\n\nAvailable\n${data.balance_pcu} PCU\n\nLifetime earned\n${data.total_minted_pcu} PCU\n\n/redeem <amount> to cash out.`,
    { parse_mode: 'Markdown' }
  );
});
bot.command('status', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const phone = await getPhoneNumber(userId);
  const { clusterId } = await resolveCluster(ctx, userId);
  if (!clusterId) return ctx.reply('Not part of a community. Use /clusters to join one.');
  await ctx.reply(`*Status*\n\nCommunity\n\`${clusterId}\`\n\nMobile\n${phone ?? 'Not registered - /register'}\n\nSend a meter photo to log your next reading.`, { parse_mode: 'Markdown' });
});
bot.command('register', async (ctx) => {
  ctx.session.awaitingPhone = true;
  await ctx.reply('Reply with your mobile number:\n`+260XXXXXXXXX` or `097XXXXXXX`', { parse_mode: 'Markdown' });
});
bot.command('clusters', async (ctx) => {
  const { data: clusters, error } = await supabase.from('clusters').select('id, name, location').in('lifecycle_state', ['FUNDING','OPERATIONAL','FUNDED']).limit(10);
  if (error) { logger.error({ error }, 'Failed to fetch clusters'); return ctx.reply('Unable to load communities.'); }
  if (!clusters?.length) return ctx.reply('No communities available. Contact your administrator.');
  const keyboard = clusters.map((cluster) => [{ text: `${cluster.name}${cluster.location ? ` - ${cluster.location}` : ''}`, callback_data: `join:${cluster.id}` }]);
  await ctx.reply(`*Energy Communities*\n\nSelect one to join:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
});
bot.action(/^join:(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clusterId = ctx.match[1];
  const telegramId = ctx.from.id.toString();
  let userId: string;
  try { userId = await resolveUserId(telegramId); }
  catch (err: unknown) { logger.error({ err, telegramId }, 'Failed to resolve user before cluster join'); return ctx.reply('Authentication error. Please try /start first.'); }
  let joinSuccess = false;
  for (let i = 0; i < 3; i++) {
    const { error: joinError } = await supabase.from('cluster_members').upsert({ cluster_id: clusterId, user_id: userId }, { onConflict: 'cluster_id,user_id' });
    if (!joinError) { joinSuccess = true; break; }
    logger.warn({ joinError, attempt: i + 1, userId, clusterId }, 'Cluster join attempt failed');
    if (i === 2) { logger.error({ joinError, userId, clusterId }, 'Failed to join cluster after retries'); return ctx.reply('Could not join community.'); }
    await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
  }
  await setSelectedCluster(userId, clusterId);
  ctx.session.clusterId = clusterId;
  const { data: cluster, error: clusterError } = await supabase.from('clusters').select('name').eq('id', clusterId).single();
  if (clusterError) logger.warn({ clusterError, clusterId }, 'Failed to fetch cluster name');
  const phone = await getPhoneNumber(userId);
  const pending = await getPendingReading(telegramId);
  const clusterName = cluster?.name ?? `\`${clusterId}\``;
  if (pending?.stage === 'awaiting_cluster') {
    await ctx.editMessageText(`*Joined ${clusterName}*\n\nProcessing your saved photo...`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(`Joined ${clusterName}. Processing your saved photo...`));
    await clearPendingReading(telegramId);
    const statusMsg = await ctx.reply('Reading your meter...');
    await processPhotoFile(ctx as any, userId, telegramId, pending.fileId, statusMsg.message_id);
    return;
  }
  await ctx.editMessageText(`*Joined ${clusterName}*\n\n${phone ? 'Send a meter photo to log a reading.' : 'Register your mobile number:\n/register'}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(`*Joined ${clusterName}*\n\n${phone ? 'Send a meter photo to log a reading.' : 'Register your mobile number:\n/register'}`, { parse_mode: 'Markdown' }));
});
bot.command('history', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const { data: readings, error } = await supabase.from('meter_readings').select('reading_kwh, meter_type, captured_at, delta_kwh').eq('user_id', userId).order('captured_at', { ascending: false }).limit(5);
  if (error) { logger.error({ error, userId }, 'Failed to fetch reading history'); return ctx.reply('Unable to load history.'); }
  if (!readings?.length) return ctx.reply('No readings yet.');
  let totalExport = 0;
  let msg = `*Recent Submissions*\n\n`;
  for (const r of readings) {
    const date = new Date(r.captured_at).toLocaleDateString('en-GB');
    const delta = r.delta_kwh ? `${r.delta_kwh > 0 ? '+' : ''}${r.delta_kwh} kWh` : 'baseline';
    const type = r.meter_type.replace(/_/g, ' ');
    msg += `${r.reading_kwh} kWh (${type}) - ${delta} - ${date}\n`;
    if (r.delta_kwh && r.delta_kwh > 0 && (r.meter_type === 'solar_export' || r.meter_type === 'solar_generation')) totalExport += r.delta_kwh;
  }
  if (totalExport > 0) msg += `\nTotal export: ${totalExport.toFixed(2)} kWh`;
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});
bot.command('redeem', async (ctx) => {
  if (!ctx.message || !('text' in ctx.message)) return;
  const parts = ctx.message.text.split(' ');
  const amount = parseFloat(parts[1]);
  if (isNaN(amount) || amount <= 0) return ctx.reply('Usage: /redeem <amount>  e.g. /redeem 5');
  const userId = await resolveUserId(ctx.from.id.toString());
  const phone = await getPhoneNumber(userId);
  if (!phone) return ctx.reply('Register your mobile number first: /register');
  const { clusterId } = await resolveCluster(ctx, userId);
  if (!clusterId) { await ctx.reply('Join a community first. Use /clusters.'); await promptForCluster(ctx); return; }
  const reference = crypto.randomUUID();
  await setPendingRedemption(userId, { userId, phone, amountPcu: amount, clusterId, reference, expiresAt: Date.now() + 60_000 });
  try { await createPendingRedemption({ userId, clusterId, amountPcu: amount, phone, reference, idempotencyKey: reference }, logger); }
  catch (err: unknown) { logger.error({ err, userId }, 'Failed to create pending redemption'); return ctx.reply('Unable to initiate redemption.'); }
  await ctx.reply(`*Confirm Redemption*\n\nAmount\n${amount} PCU\n\nRecipient\n${maskPhone(phone)}\n\nCommunity\n\`${clusterId}\`\n\nReply YES to confirm.`, { parse_mode: 'Markdown' });
});
bot.command('transfer', async (ctx) => {
  if (!ctx.message || !('text' in ctx.message)) return;
  const parts = ctx.message.text.split(' ');
  const amount = parseFloat(parts[1]);
  const targetUsername = parts[2]?.replace('@', '');
  if (!amount || amount <= 0 || !targetUsername) return ctx.reply('Usage: /transfer <amount> <@username>');
  const senderId = await resolveUserId(ctx.from.id.toString());
  const result = await transferPCU({ fromUserId: senderId, toUsername: targetUsername, amountPcu: amount, logger });
  if (!result.success) return ctx.reply(result.errorMessage || 'Transfer failed.');
  await ctx.reply(`Transferred ${amount} PCU to @${targetUsername}`);
});
bot.action(/^resetmeter_type_(.+)$/, async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  await resetmeterTypeCallback(ctx, userId, ctx.match[1] as MeterType, logger);
});
bot.action('resetmeter_confirm_yes', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  await resetmeterConfirmCallback(ctx, userId, true, logger);
});
bot.action('resetmeter_confirm_no', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  await resetmeterConfirmCallback(ctx, userId, false, logger);
});
bot.action(/^role:(.+)$/, async (ctx: any) => { await handleRoleSelection(ctx, ctx.match[1]); });
bot.action('quick_support', (ctx: any) => startQuickSupport(ctx));
bot.action(/^metertype:(grid_import|solar_export)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const pending = await getPendingReading(telegramId);
  if (!pending || pending.stage !== 'awaiting_meter_type') { await ctx.editMessageText('Session expired. Send the photo again.'); return; }
  const userId = await resolveUserId(telegramId);
  const meterType = ctx.match[1] as Extract<MeterType, 'grid_import' | 'solar_export'>;
  const ocrResult: MeterOcrResult = { ...pending.ocrResult, meterType };
  await processAndSaveReading(ctx as any, userId, telegramId, ocrResult, pending.imageUrl, crypto.randomUUID(), ctx.callbackQuery.message?.message_id);
});
bot.action('payments_menu', (ctx: any) => showPaymentsMenu(ctx));
bot.action('tenant_subscribe', (ctx: any) => showSubscriptionOptions(ctx));
bot.action(/^sub_plan:(.+)/, (ctx: any) => handlePlanSelection(ctx));
bot.action('op_customers', (ctx: any) => handleOrgCustomers(ctx));
bot.action('op_energy', (ctx: any) => handleOrgEnergyFeed(ctx));
bot.action('alerts_list', (ctx: any) => handleOrgAlerts(ctx));
bot.action('operator_settings', (ctx: any) => handleOrgSettings(ctx));
bot.action('op_add_customer', (ctx: any) => handleAddCustomer(ctx));
bot.action('demo_operator', (ctx: any) => handleTransactionDashboard(ctx));
bot.action('demo_failed', (ctx: any) => handleFailedTransactions(ctx));
bot.action('demo_search', (ctx: any) => startSearch(ctx));
bot.action('demo_customer', (ctx: any) => startCustomerView(ctx));
bot.action('demo_recent', (ctx: any) => handleRecentActivity(ctx));
bot.action(/txn_detail_(.+)/, (ctx: any) => handleTransactionDetail(ctx));
bot.action('installer_installs', (ctx: any) => handleInstallerInstalls(ctx));
bot.action('installer_faults', (ctx: any) => handleInstallerFaults(ctx));
bot.action('installer_report_fault', (ctx: any) => handleInstallerReportFault(ctx));

// ─── Message handlers ────────────────────────────────────────────────
bot.on(message('photo'), async (ctx) => {
  const photo = ctx.message.photo.slice(-1)[0];
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId, { username: ctx.from.username, first_name: ctx.from.first_name, last_name: ctx.from.last_name });
  const { clusterId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await setPendingReading(telegramId, { stage: 'awaiting_cluster', fileId: photo.file_id, chatId: ctx.chat.id, expiresAt: Date.now() + PENDING_TTL_SECONDS * 1000 });
    await ctx.reply('Choose a community first. I will process this photo once you join.');
    await promptForCluster(ctx);
    return;
  }
  const rateCheck = await rateLimiter.check(telegramId);
  if (!rateCheck.allowed) return ctx.reply(`Rate limit reached. Try again in ${rateCheck.retryAfterSeconds}s.`);
  const statusMsg = await ctx.reply('Reading your meter...');
  await processPhotoFile(ctx as any, userId, telegramId, photo.file_id, statusMsg.message_id);
});

bot.on(message('text'), async (ctx, next) => {
  const telegramId = ctx.from.id.toString();

  const quickSupport = await redis.get(`quick_support:${telegramId}`);
  if (quickSupport) {
    await redis.del(`quick_support:${telegramId}`);
    await handleFreeformSupport(ctx);
    return;
  }

  if (ctx.session.awaitingPhone) {
    const normalized = normalizePhoneNumber(ctx.message.text);
    if (!normalized) return ctx.reply('Invalid number. Try +260XXXXXXXXX or 097XXXXXXX.');
    const { error } = await supabase.from('telegram_users').update({ phone_number: normalized, updated_at: new Date().toISOString() }).eq('telegram_id', telegramId);
    if (error) { logger.error({ error, telegramId }, 'Failed to save phone number'); return ctx.reply('Failed to save number. Please try again.'); }
    ctx.session.awaitingPhone = false;
    return ctx.reply(`Number registered: ${normalized}\n\nSend a meter photo to log a reading and start earning.`, { parse_mode: 'Markdown' });
  }

  const demoState = await redis.get(`demo_state:${telegramId}`);
  if (demoState === 'meter_lookup') {
    await redis.del(`demo_state:${telegramId}`);
    const meter = ctx.message.text.trim();
    if (!meter) return ctx.reply('Please enter a meter number.');
    const { data: txns, error } = await supabase.from('transactions').select('*').eq('meter_number', meter).order('created_at', { ascending: false }).limit(3);
    if (error) { logger.error({ error, meter }, 'meter lookup failed'); return ctx.reply(dbErrorMessage(error)); }
    if (!txns?.length) return ctx.reply(`No transactions found for meter ${meter}.`);
    let msg = `*Meter ${meter}*\n\n`;
    txns.forEach(t => {
      const emoji = t.status === 'DELIVERED' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
      msg += `${emoji} K${t.amount} — ${new Date(t.created_at).toLocaleDateString('en-GB')}\n`;
      if (t.status === 'DELIVERED') msg += `   Token: \`${t.token}\`\n`;
      if (t.status === 'FAILED') msg += `   Reason: ${t.failure_reason}\n`;
    });
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  if (demoState === 'search') {
    await redis.del(`demo_state:${telegramId}`);
    const query = ctx.message.text.trim();
    if (!query) return ctx.reply('Please enter a meter number, phone number, or transaction ID.');
    const searchPattern = `%${query}%`;
    const { data: txns, error } = await supabase.from('transactions').select('*').or(`meter_number.ilike.${searchPattern},customer_phone.ilike.${searchPattern}`).order('created_at', { ascending: false }).limit(5);
    if (error) { logger.error({ error, query }, 'free-text search failed'); return ctx.reply(dbErrorMessage(error)); }
    if (!txns?.length) return ctx.reply(`No transactions found for "${query}".`);
    let msg = `*Search results for "${query}"*\n\n`;
    txns.forEach(t => {
      const emoji = t.status === 'DELIVERED' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
      msg += `${emoji} K${t.amount} — Meter ${t.meter_number} — ${t.status}\n`;
      if (t.status === 'FAILED') msg += `   Reason: ${t.failure_reason}\n`;
    });
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  if (demoState === 'add_customer_meter') {
    await redis.del(`demo_state:${telegramId}`);
    const userId = ctx.state?.userId;
    const orgId = ctx.state?.orgId;
    if (!orgId || !userId) return ctx.reply('Link your organisation first with /linkorg');
    await supabase.from('customers').insert({ organisation_id: orgId, meter_number: ctx.message.text.trim() });
    await redis.set(`demo_state:${telegramId}`, 'add_customer_phone', { ex: 120 });
    return ctx.reply('Enter the customer\'s phone number:');
  }
  if (demoState === 'add_customer_phone') {
    await redis.del(`demo_state:${telegramId}`);
    const userId = ctx.state?.userId;
    const orgId = ctx.state?.orgId;
    if (!orgId || !userId) return ctx.reply('Link your organisation first with /linkorg');
    const phone = normalizePhoneNumber(ctx.message.text.trim()) || ctx.message.text.trim();
    await supabase.from('customers').update({ phone }).eq('organisation_id', orgId).is('phone', null).order('created_at', { ascending: false }).limit(1);
    return ctx.reply('Customer added. Use 👥 Customers to view your list.');
  }

  const userId = await resolveUserId(telegramId);
  const pending = await getPendingRedemption(userId);
  if (pending && Date.now() < pending.expiresAt && ctx.message.text.trim().toUpperCase() === 'YES') {
    await clearPendingRedemption(userId);
    try {
      const fxRate = await getLiveExchangeRate();
      const amountZmw = pending.amountPcu * fxRate;
      const payout = await requestLencoPayout({ userId: pending.userId, clusterId: pending.clusterId, amount: amountZmw, phoneNumber: pending.phone, narration: `PCU Redemption - ${pending.amountPcu} PCU`, reference: pending.reference, idempotencyKey: pending.reference }, logger);
      await ctx.reply(`*Settlement Complete*\n\nAmount\nK${amountZmw.toFixed(2)}\n\nRecipient\n${maskPhone(pending.phone)}\n\nReference\n${payout.reference}\n\nStatus\nSUCCESS\n\nSMS confirmation arriving shortly.`, { parse_mode: 'Markdown' });
    } catch (err: unknown) {
      logger.error({ err: (err as Error).message }, 'Redemption failed');
      return ctx.reply(`Redemption failed: ${(err as Error).message}`);
    }
  }
  return next();
});

bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, 'Bot error');
  ctx.reply('An unexpected error occurred. Our team has been notified.');
});
process.once('SIGINT', () => { logger.info('SIGINT received'); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { logger.info('SIGTERM received'); bot.stop('SIGTERM'); });

// ─── Launch ───────────────────────────────────────────────────────────
const WEBHOOK_URL = process.env.WEBHOOK_URL;
async function registerBotCommands() {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Welcome' },
      { command: 'help', description: 'List commands' },
      { command: 'support', description: 'Ask Enerlectra support' },
      { command: 'linkorg', description: 'Link to organisation' },
      { command: 'balance', description: 'Check PCU balance' },
      { command: 'status', description: 'View linked cluster' },
      { command: 'history', description: 'Past submissions' },
      { command: 'privacy', description: 'Privacy policy' },
    ]);
    logger.info('Telegram command menu updated');
  } catch (err: unknown) { logger.warn({ err: (err as Error).message }, 'Failed to register Telegram commands'); }
}
setTimeout(() => {
  void (async () => {
    await registerBotCommands();
    if (WEBHOOK_URL) {
      app.use(bot.webhookCallback('/webhook'));
      app.listen(Number(PORT), async () => {
        logger.info(`Ellie is online via webhook on port ${PORT}`);
        try {
          await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
          const info = await bot.telegram.getWebhookInfo();
          logger.info({ url: info.url, pending: info.pending_update_count }, 'Webhook configured');
        } catch (err: unknown) { logger.error({ err: (err as Error).message }, 'Webhook setup failed'); }
      });
    } else {
      bot.launch().then(() => logger.info('Ellie is online via polling!')).catch((err: unknown) => { logger.fatal({ err: (err as Error).message }, 'Bot polling launch failed'); process.exit(1); });
    }
  })();
}, WEBHOOK_URL ? 1000 : 10000);