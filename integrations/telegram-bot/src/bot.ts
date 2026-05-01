import dotenv from 'dotenv';
dotenv.config();

import { Context, Telegraf, session } from 'telegraf';
import { message } from 'telegraf/filters';
import express from 'express';
import { supabase } from './lib/supabase';
import { redis, PENDING_TTL_SECONDS, REDIS_KEY_PREFIX } from './lib/redis';
import { createRedisSessionStore } from './lib/session-store';
import pino from 'pino';
import crypto from 'node:crypto';

import { MeterOcrResult, MeterType, readMeterOCR, setLogger as setOcrLogger } from './services/ocr';
import { validateReading } from './services/validation';
import { calculateValue, type ValueEstimate } from './services/tariff-calculator';
import { OCRRateLimiter } from './services/rate-limiter';
import { createPendingRedemption, requestLencoPayout } from './services/settlement';
import { backfillPCUWalletForUser, mintPCUForExportReading } from './services/pcuMinting';
import { transferPCU } from './services/pcuTransfer';
import {
  resetmeterCommand,
  resetmeterConfirmCallback,
  resetmeterTypeCallback,
} from './commands/resetmeter';

// ─── Environment Validation ─────────────────────────────────────────
const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing environment variable ${key}`);
    process.exit(1);
  }
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
setOcrLogger(logger);

const rateLimiter = new OCRRateLimiter(logger);

// ─── Health Check Server ─────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Ellie is awake and monitoring the grid.'));
// NOTE: app.listen() moved to bot launch section — both share the same server

// ─── Redis Key Prefixes ──────────────────────────────────────────────
const PENDING_READING_PREFIX = `${REDIS_KEY_PREFIX}:pending_reading`;
const PENDING_REDEMPTION_PREFIX = `${REDIS_KEY_PREFIX}:pending_redemption`;
const SELECTED_CLUSTER_PREFIX = `${REDIS_KEY_PREFIX}:selected_cluster`;

// ─── Type Definitions ────────────────────────────────────────────────
interface BotSession {
  clusterId?: string;
  awaitingPhone?: boolean;
}

interface BotContext extends Context {
  session: BotSession;
}

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

interface ValidationResult {
  valid: boolean;
  reason?: string;
  delta?: number;
  prevKwh?: number | null;
  flag?: 'first_reading' | 'after_reset' | 'normal';
  visualMismatch?: boolean;
  imageHash?: string;
  hammingDistance?: number;
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

// ─── Bot Instance ────────────────────────────────────────────────────
const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);

bot.use(
  session({
    store: createRedisSessionStore<BotSession>(),
    getSessionKey: (ctx) => ctx.from?.id.toString(),
    defaultSession: (): BotSession => ({}),
  })
);

// ─── Helper Functions ────────────────────────────────────────────────
async function getPendingReading(telegramId: string): Promise<PendingReading | null> {
  const key = `${PENDING_READING_PREFIX}:${telegramId}`;
  const data = await redis.get<PendingReading | string>(key);
  if (!data) return null;

  const parsed: PendingReading =
    typeof data === 'string' ? (JSON.parse(data) as PendingReading) : data;

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
  await redis.set(`${PENDING_READING_PREFIX}:${telegramId}`, JSON.stringify(value), {
    ex: PENDING_TTL_SECONDS,
  });
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

  const parsed: PendingRedemption =
    typeof data === 'string' ? (JSON.parse(data) as PendingRedemption) : data;

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
  await redis.set(`${PENDING_REDEMPTION_PREFIX}:${userId}`, JSON.stringify(value), {
    ex: PENDING_TTL_SECONDS,
  });
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
  let normalized = cleaned;

  if (normalized.startsWith('0')) normalized = `+260${normalized.slice(1)}`;
  if (normalized.startsWith('260')) normalized = `+${normalized}`;

  return /^\+260\d{9}$/.test(normalized) ? normalized : null;
}

function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

function generateReadingKey(
  userId: string,
  clusterId: string,
  meterType: string,
  period: string,
  readingKwh: number
): string {
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

// ─── Core Identity & Cluster Resolution ──────────────────────────────
async function resolveUserId(
  telegramId: string,
  profile?: { username?: string; first_name?: string; last_name?: string }
): Promise<string> {
  // 1. Upsert telegram identity
  const { data: telegramUser, error: upsertError } = await supabase
    .from('telegram_users')
    .upsert(
      {
        telegram_id: telegramId,
        username: profile?.username ?? null,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id' }
    )
    .select('user_id')
    .single();

  if (upsertError || !telegramUser?.user_id) {
    logger.error({ upsertError, telegramId }, 'Failed to resolve telegram identity');
    throw new Error('Identity resolution failed');
  }

  const userId = telegramUser.user_id;

  // 2. CRITICAL: Ensure user exists in auth.users (required by all FKs)
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

  if (authError || !authUser?.user) {
    logger.warn({ authError, userId }, 'Auth user not found, creating...');

    const { data: newAuthUser, error: createAuthError } = await supabase.auth.admin.createUser({
      id: userId,
      email: `telegram-${telegramId}@enerlectra.local`,
      email_confirm: true,
      password: crypto.randomBytes(32).toString('hex'),
      user_metadata: {
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Telegram User',
        source: 'telegram_bot',
      },
    });

    if (createAuthError) {
      logger.error({ createAuthError, userId }, 'Failed to create auth user');
      throw new Error('Auth user creation failed');
    }

    logger.info({ userId }, 'Created new auth user for Telegram');
  }

  // 3. Ensure public.users profile exists
  const userName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Telegram User';

  const { error: profileError } = await supabase.from('users').upsert(
    {
      id: userId,
      name: userName,
      email: `telegram-${telegramId}@enerlectra.local`,
      phone: '+260000000000',
      location: null,
      current_class: 'STARTER',
      total_invested_usd: '0.00',
      cluster_count: 0,
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    logger.error({ profileError, userId }, 'Profile upsert failed');
    throw new Error('Profile creation failed');
  }

  return userId;
}

async function getPhoneNumber(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ error, userId }, 'Failed to fetch phone number');
    return null;
  }
  return data?.phone_number ?? null;
}

async function resolveCluster(
  ctx: BotContext,
  userId: string
): Promise<{ clusterId: string | null; unitId: string | null }> {
  if (ctx.session.clusterId) return { clusterId: ctx.session.clusterId, unitId: null };

  const cached = await getSelectedCluster(userId);
  if (cached) {
    ctx.session.clusterId = cached;
    return { clusterId: cached, unitId: null };
  }

  const { data, error } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ error, userId }, 'Failed to resolve cluster');
  }

  if (data?.cluster_id) {
    ctx.session.clusterId = data.cluster_id;
    return { clusterId: data.cluster_id, unitId: null };
  }

  return { clusterId: null, unitId: null };
}

// ─── UI Helpers ──────────────────────────────────────────────────────
async function promptForCluster(ctx: BotContext): Promise<void> {
  const { data: clusters, error } = await supabase
    .from('clusters')
    .select('id, name, location')
    .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
    .limit(10);

  if (error) {
    logger.error({ error }, 'Failed to fetch clusters');
    await ctx.reply('Unable to load communities. Please try again later.');
    return;
  }

  if (!clusters?.length) {
    await ctx.reply('No communities available. Contact support or try again later.');
    return;
  }

  const keyboard = clusters.map((cluster) => [
    {
      text: `${cluster.name}${cluster.location ? ` - ${cluster.location}` : ''}`,
      callback_data: `join:${cluster.id}`,
    },
  ]);

  await ctx.reply('Select a community to join:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function replyOrEdit(
  ctx: BotContext,
  text: string,
  extra?: Record<string, unknown>,
  editMessageId?: number
): Promise<unknown> {
  if (editMessageId && ctx.chat?.id) {
    return ctx.telegram
      .editMessageText(ctx.chat.id, editMessageId, undefined, text, extra)
      .catch(() => ctx.reply(text, extra));
  }
  return ctx.reply(text, extra);
}

// ─── Value & Payout Logic ────────────────────────────────────────────
async function handleReadingValueAndPayout(
  ctx: BotContext,
  userId: string,
  clusterId: string,
  reading: ReadingRecord,
  validation: ValidationResult,
  requestId: string
): Promise<ValueResult> {
  const isExport =
    reading.meter_type === 'solar_export' || reading.meter_type === 'solar_generation';
  const phone = await getPhoneNumber(userId);

  let result: ValueResult = {
    message: isExport
      ? '\nExport baseline recorded. PCU earnings start on your next submission. Check /balance.'
      : '\nImport reading logged. No payout for consumption.',
  };

  if (isExport) {
    try {
      await mintPCUForExportReading(reading);
      if (validation.delta && validation.delta > 0) {
        result.message = '\nPCUs minted for export. Check /balance.';
      }
    } catch (err: unknown) {
      logger.error({ err, readingId: reading.id, userId }, 'PCU minting failed');
      result.message =
        validation.delta && validation.delta > 0
          ? '\nExport reading saved, but PCU wallet update is pending.'
          : '\nExport baseline recorded, but wallet setup is pending.';
    }
  }

  if (!validation.delta || validation.delta <= 0) {
    return result;
  }

  try {
    const value = await calculateValue(
      validation.delta,
      reading.meter_type as MeterType,
      userId,
      clusterId,
      requestId,
      logger,
      { consentGiven: true }
    );

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
      const payout = await requestLencoPayout(
        {
          userId,
          clusterId,
          readingId: reading.id,
          amount: value.netValue,
          phoneNumber: phone,
          narration: `Enerlectra credit - ${validation.delta.toFixed(2)} kWh`,
        },
        logger
      );

      result.payoutRef = payout.reference;
      result.payoutStatus = payout.status;
      result.payoutAmount = value.netValue;
      result.message =
        `\nValue: K${value.netValue.toFixed(2)}` +
        `\nPayout: K${value.netValue.toFixed(2)}` +
        `\nTo: ${maskPhone(phone)}` +
        `\nRef: ${payout.reference}`;
    } catch (err: unknown) {
      logger.error({ err }, 'Auto-payout failed');
      result.message = `\nValue: K${value.netValue.toFixed(2)}\nPayout failed. Support will follow up within 24h.`;
    }

    return result;
  } catch (err: unknown) {
    logger.error({ err }, 'Value calculation failed');
    result.message = '\nValue calculation unavailable.';
    return result;
  }
}

function formatReadingMessage(
  currentKwh: number,
  prevKwh: number | null,
  delta: number | null,
  meterType: MeterType,
  period: string,
  clusterId: string,
  valueResult: ValueResult,
  isFirstReading: boolean,
  isAfterReset: boolean,
  visualMismatch?: boolean
): string {
  const periodLabel = formatPeriod(period);

  if (isFirstReading || isAfterReset || delta === null) {
    const title = isAfterReset ? 'Baseline reset' : 'Baseline recorded';
    const subtitle = isAfterReset
      ? 'New baseline after meter reset.'
      : 'First reading for this meter.';

    return (
      `*${title}*\n\n` +
      `Meter\n${currentKwh.toFixed(2)} kWh\n\n` +
      `Previous\n-\n\n` +
      `${subtitle}\n` +
      `Earnings calculated on next submission.\n\n` +
      `Community\n\`${clusterId}\`\n` +
      `Period\n${periodLabel}`
    );
  }

  const deltaSign = delta > 0 ? '+' : '';
  const isExport = meterType === 'solar_export' || meterType === 'solar_generation';
  const usageLabel = isExport ? 'Export' : 'Usage';

  let msg =
    `*Reading accepted*\n\n` +
    `Meter\n${currentKwh.toFixed(2)} kWh\n\n` +
    `Previous\n${prevKwh!.toFixed(2)} kWh\n\n` +
    `${usageLabel}\n${deltaSign}${delta.toFixed(2)} kWh\n`;

  msg += valueResult.message;
  msg += `\n\nCommunity\n\`${clusterId}\`\nPeriod\n${periodLabel}`;

  if (valueResult.payoutRef) {
    msg += '\n\nStatus: Settled';
  } else if (isExport && delta > 0) {
    msg += '\n\nNext\n/redeem to cash out';
  } else if (!isExport) {
    msg += '\n\nNext\n/history to track consumption';
  }

  if (visualMismatch) {
    msg += '\n\nNote: Meter image differs from previous submission. Contact support if you changed meters.';
  }

  return msg;
}

// ─── Core Processing ─────────────────────────────────────────────────
async function processAndSaveReading(
  ctx: BotContext,
  userId: string,
  telegramId: string,
  ocrResult: MeterOcrResult,
  imageUrl: string,
  requestId: string,
  editMessageId?: number
): Promise<void> {
  const { clusterId, unitId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await replyOrEdit(ctx, 'Join a community first. Use /clusters.', undefined, editMessageId);
    await promptForCluster(ctx);
    return;
  }

  try {
    const validation = await validateReading({
      userId,
      clusterId,
      newKwh: ocrResult.kwh!,
      confidence: ocrResult.confidence,
      meterType: ocrResult.meterType,
      imageUrl,
      requestId,
      logger,
    });

    if (!validation.valid) {
      await clearPendingReading(telegramId);
      await replyOrEdit(ctx, `Rejected\n\n${validation.reason}`, undefined, editMessageId);
      return;
    }

    const period = getCurrentPeriod();
    const readingKey = generateReadingKey(
      userId,
      clusterId,
      ocrResult.meterType,
      period,
      ocrResult.kwh!
    );

    const metadata: Record<string, unknown> = {};
    if (validation.imageHash) metadata.image_hash = validation.imageHash;
    if (validation.hammingDistance !== undefined) {
      metadata.hamming_distance = validation.hammingDistance;
    }
    if (validation.visualMismatch) metadata.visual_mismatch = true;

    const { data: reading, error: insertError } = await supabase
      .from('meter_readings')
      .insert({
        user_id: userId,
        cluster_id: clusterId,
        unit_id: unitId,
        reading_kwh: ocrResult.kwh,
        meter_type: ocrResult.meterType,
        photo_url: imageUrl,
        ocr_confidence: ocrResult.confidence,
        validated: true,
        captured_at: new Date().toISOString(),
        reporting_period: period,
        source: 'telegram',
        delta_kwh: validation.delta ?? 0,
        reading_key: readingKey,
        status: 'active',
        metadata,
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    if (!reading) throw new Error('Insert succeeded but no reading returned');

    const valueResult = await handleReadingValueAndPayout(
      ctx,
      userId,
      clusterId,
      reading as ReadingRecord,
      validation as ValidationResult,
      requestId
    );

    const isFirstReading = validation.flag === 'first_reading';
    const isAfterReset = validation.flag === 'after_reset';
    const messageText = formatReadingMessage(
      ocrResult.kwh!,
      validation.prevKwh ?? null,
      validation.delta ?? null,
      ocrResult.meterType,
      period,
      clusterId,
      valueResult,
      isFirstReading,
      isAfterReset,
      validation.visualMismatch
    );

    await clearPendingReading(telegramId);
    await replyOrEdit(ctx, messageText, { parse_mode: 'Markdown' }, editMessageId);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ error: err.message }, 'Processing error');
    await clearPendingReading(telegramId);
    await replyOrEdit(ctx, `Failed to save reading: ${err.message}`, undefined, editMessageId);
  }
}

async function promptForMeterTypeSelection(
  ctx: BotContext,
  telegramId: string,
  imageUrl: string,
  ocrResult: MeterOcrResult,
  editMessageId?: number
): Promise<void> {
  await setPendingReading(telegramId, {
    stage: 'awaiting_meter_type',
    imageUrl,
    ocrResult,
    chatId: ctx.chat?.id ?? 0,
    expiresAt: Date.now() + PENDING_TTL_SECONDS * 1000,
  });

  const sourceNote =
    ocrResult.source === 'claude_vision'
      ? '\n_AI vision reading - please verify carefully._'
      : '';

  const text =
    `Reading detected: ${ocrResult.kwh} kWh\n` +
    `Confidence: ${(ocrResult.confidence * 100).toFixed(0)}%${sourceNote}\n\n` +
    `What type of reading is this?`;

  await replyOrEdit(
    ctx,
    text,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Grid Import', callback_data: 'metertype:grid_import' },
            { text: 'Solar Export', callback_data: 'metertype:solar_export' },
          ],
        ],
      },
    },
    editMessageId
  );
}

async function processPhotoFile(
  ctx: BotContext,
  userId: string,
  telegramId: string,
  fileId: string,
  editMessageId?: number
): Promise<void> {
  const requestId = crypto.randomUUID();

  try {
    const file = await ctx.telegram.getFile(fileId);
    if (!file) {
      throw new Error('Telegram API did not return file metadata');
    }
    if (!file.file_path) {
      throw new Error('Telegram file path missing');
    }

    const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const ocrResult = await readMeterOCR(imageUrl, { requestId });

    if (ocrResult.status === 'manual_required') {
      await clearPendingReading(telegramId);
      await replyOrEdit(
        ctx,
        `Automatic reading unavailable.\n\nEnter manually:\n/read <value>  e.g. /read 152.61`,
        { parse_mode: 'Markdown' },
        editMessageId
      );
      return;
    }

    if (ocrResult.status === 'failed' || !ocrResult.kwh) {
      await clearPendingReading(telegramId);
      await replyOrEdit(
        ctx,
        `Could not read the meter.\n\n${ocrResult.error || 'No numbers detected'}\n\n` +
          `Tips:\n- Hold phone steady, parallel to meter\n- Ensure display is lit\n- Avoid glare\n\nOr enter manually: /read <value>`,
        { parse_mode: 'Markdown' },
        editMessageId
      );
      return;
    }

    if (ocrResult.meterType === 'unknown') {
      await promptForMeterTypeSelection(ctx, telegramId, imageUrl, ocrResult, editMessageId);
      return;
    }

    if (ocrResult.status === 'review' || ocrResult.confidence < 0.8) {
      const sourceNote =
        ocrResult.source === 'claude_vision'
          ? '\n_AI vision reading - please verify carefully._'
          : '';

      await replyOrEdit(
        ctx,
        `Reading detected: ${ocrResult.kwh} kWh\n` +
          `Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
          `Confidence: ${(ocrResult.confidence * 100).toFixed(0)}%${sourceNote}\n\n` +
          `Saving...`,
        { parse_mode: 'Markdown' },
        editMessageId
      );
    }

    await processAndSaveReading(
      ctx,
      userId,
      telegramId,
      ocrResult,
      imageUrl,
      requestId,
      editMessageId
    );
  } catch (err: unknown) {
    logger.error({ err, telegramId }, 'Photo handler error');
    await clearPendingReading(telegramId);
    await replyOrEdit(ctx, 'An unexpected error occurred. Please try again.', undefined, editMessageId);
  }
}

// ─── Bot Commands ──────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const startPayload = (ctx as unknown as { startPayload?: string }).startPayload;
  const telegramId = ctx.from.id.toString();

  const userId = await resolveUserId(telegramId, {
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
  });

  if (startPayload) {
    try {
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const clusterId = decoded
        .split('|')
        .find((part) => part.startsWith('c:'))
        ?.replace('c:', '');

      if (clusterId) {
        ctx.session.clusterId = clusterId;

        const { error: joinError } = await supabase
          .from('cluster_members')
          .upsert({ cluster_id: clusterId, user_id: userId }, { onConflict: 'cluster_id,user_id' });

        if (joinError) {
          logger.error({ joinError, userId, clusterId }, 'Start payload cluster join failed');
          await ctx.reply('Welcome! We had trouble linking your community. Use /clusters to join manually.');
          return;
        }

        return ctx.reply(
          `*Welcome to Enerlectra*\n\nCommunity: \`${clusterId}\`\n\nSend a meter photo to log a reading.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch {
      // Ignore malformed start payloads
    }
  }

  const phone = await getPhoneNumber(userId);

  await ctx.reply(
    `*Enerlectra*\n\n` +
      `Your energy, your earnings.\n\n` +
      (phone ? '' : `Register your mobile number: /register\n\n`) +
      `Commands:\n` +
      `Send a meter photo - Submit a reading\n` +
      `/read <kWh> [type] - Manual entry\n` +
      `/balance - Check PCU balance\n` +
      `/status - View linked cluster\n` +
      `/register - Add mobile money number\n` +
      `/history - View past submissions\n` +
      `/redeem <amount> - Cash out PCU\n` +
      `/transfer <amount> <@user> - Send PCU\n` +
      `/clusters - Browse communities\n` +
      `/resetmeter - Reset meter baseline`,
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
      `/resetmeter - Reset meter after replacement`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('balance', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
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
    } catch (err: unknown) {
      logger.error({ err, userId }, 'PCU wallet backfill failed');
    }
  }

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch PCU balance');
    return ctx.reply('Unable to load your PCU wallet right now. Please try again.');
  }

  if (!data) {
    return ctx.reply('No PCU wallet found. Submit an export reading first.');
  }

  await ctx.reply(
    `*PCU Balance*\n\n` +
      `Available\n${data.balance_pcu} PCU\n\n` +
      `Lifetime earned\n${data.total_minted_pcu} PCU\n\n` +
      `/redeem <amoun..,mt> to cash out.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('status', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const phone = await getPhoneNumber(userId);
  const { clusterId } = await resolveCluster(ctx, userId);

  if (!clusterId) {
    await ctx.reply('Not part of a community. Use /clusters to join one.');
    return;
  }

  await ctx.reply(
    `*Status*\n\n` +
      `Community\n\`${clusterId}\`\n\n` +  // ← backticks escape the underscore
      `Mobile\n${phone ?? 'Not registered - /register'}\n\n` +
      `Send a meter photo to log your next reading.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('register', async (ctx) => {
  ctx.session.awaitingPhone = true;
  await ctx.reply('Reply with your mobile number:\n`+260XXXXXXXXX` or `097XXXXXXX`', {
    parse_mode: 'Markdown',
  });
});

bot.command('clusters', async (ctx) => {
  const { data: clusters, error } = await supabase
    .from('clusters')
    .select('id, name, location')
    .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
    .limit(10);

  if (error) {
    logger.error({ error }, 'Failed to fetch clusters');
    return ctx.reply('Unable to load communities. Please try again.');
  }

  if (!clusters?.length) {
    return ctx.reply('No communities available. Contact your administrator.');
  }

  const keyboard = clusters.map((cluster) => [
    {
      text: `${cluster.name}${cluster.location ? ` - ${cluster.location}` : ''}`,
      callback_data: `join:${cluster.id}`,
    },
  ]);

  await ctx.reply(`*Energy Communities*\n\nSelect one to join:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  });
});

bot.action(/^join:(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const clusterId = ctx.match[1];
  const telegramId = ctx.from.id.toString();

  let userId: string;
  try {
    userId = await resolveUserId(telegramId);
  } catch (err: unknown) {
    logger.error({ err, telegramId }, 'Failed to resolve user before cluster join');
    return ctx.reply('Authentication error. Please try /start first.');
  }

  // Retry join up to 3 times with exponential backoff
  let joinSuccess = false;
  for (let i = 0; i < 3; i++) {
    const { error: joinError } = await supabase
      .from('cluster_members')
      .upsert({ cluster_id: clusterId, user_id: userId }, { onConflict: 'cluster_id,user_id' });

    if (!joinError) {
      joinSuccess = true;
      break;
    }

    logger.warn({ joinError, attempt: i + 1, userId, clusterId }, 'Cluster join attempt failed');

    if (i === 2) {
      logger.error({ joinError, userId, clusterId }, 'Failed to join cluster after retries');
      return ctx.reply('Could not join community. Please try again later.');
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
  }

  await setSelectedCluster(userId, clusterId);
  ctx.session.clusterId = clusterId;

  const { data: cluster, error: clusterError } = await supabase
    .from('clusters')
    .select('name')
    .eq('id', clusterId)
    .single();

  if (clusterError) {
    logger.warn({ clusterError, clusterId }, 'Failed to fetch cluster name');
  }

  const phone = await getPhoneNumber(userId);
  const pending = await getPendingReading(telegramId);
  const clusterName = cluster?.name ?? `\`${clusterId}\``;

  if (pending?.stage === 'awaiting_cluster') {
    await ctx
      .editMessageText(`*Joined ${clusterName}*\n\nProcessing your saved photo...`, {
        parse_mode: 'Markdown',
      })
      .catch(() => ctx.reply(`Joined ${clusterName}. Processing your saved photo...`));

    await clearPendingReading(telegramId);
    const statusMsg = await ctx.reply('Reading your meter...');
    await processPhotoFile(ctx, userId, telegramId, pending.fileId, statusMsg.message_id);
    return;
  }

  await ctx
    .editMessageText(
      `*Joined ${clusterName}*\n\n` +
        (phone ? `Send a meter photo to log a reading.` : `Register your mobile number:\n/register`),
      { parse_mode: 'Markdown' }
    )
    .catch(() =>
      ctx.reply(
        `*Joined ${clusterName}*\n\n` +
          (phone ? `Send a meter photo to log a reading.` : `Register your mobile number:\n/register`),
        { parse_mode: 'Markdown' }
      )
    );
});

bot.command('history', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const { data: readings, error } = await supabase
    .from('meter_readings')
    .select('reading_kwh, meter_type, captured_at, delta_kwh')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(5);

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch reading history');
    return ctx.reply('Unable to load history. Please try again.');
  }

  if (!readings?.length) {
    return ctx.reply('No readings yet.');
  }

  let totalExport = 0;
  let msg = `*Recent Submissions*\n\n`;

  for (const reading of readings) {
    const date = new Date(reading.captured_at).toLocaleDateString('en-GB');
    const delta = reading.delta_kwh
      ? `${reading.delta_kwh > 0 ? '+' : ''}${reading.delta_kwh} kWh`
      : 'baseline';
    
    // FIX: Sanitize meter_type to prevent Telegram Markdown parse errors
    const sanitizedMeterType = reading.meter_type.replace(/_/g, ' ');
    
    msg += `${reading.reading_kwh} kWh (${sanitizedMeterType}) - ${delta} - ${date}\n`;

    if (
      reading.delta_kwh &&
      reading.delta_kwh > 0 &&
      (reading.meter_type === 'solar_export' || reading.meter_type === 'solar_generation')
    ) {
      totalExport += reading.delta_kwh;
    }
  }

  if (totalExport > 0) {
    msg += `\nTotal export: ${totalExport.toFixed(2)} kWh\nSubmit regularly to maximize earnings.`;
  }

  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('redeem', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const amount = parseFloat(parts[1]);
  if (Number.isNaN(amount) || amount <= 0) {
    return ctx.reply('Usage: /redeem <amount>  e.g. /redeem 5');
  }

  const userId = await resolveUserId(ctx.from.id.toString());
  const phone = await getPhoneNumber(userId);
  if (!phone) return ctx.reply('Register your mobile number first: /register');

  const { clusterId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await ctx.reply('Join a community first. Use /clusters.');
    await promptForCluster(ctx);
    return;
  }

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
  } catch (err: unknown) {
    logger.error({ err, userId }, 'Failed to create pending redemption');
    return ctx.reply('Unable to initiate redemption. Please try again.');
  }

  await ctx.reply(
    `*Confirm Redemption*\n\n` +
      `Amount\n${amount} PCU\n\n` +
      `Recipient\n${maskPhone(phone)}\n\n` +
      `Community\n\`${clusterId}\`\n\n` +
      `Reply YES to confirm.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('transfer', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const amount = parseFloat(parts[1]);
  const targetUsername = parts[2]?.replace('@', '');

  if (!amount || amount <= 0 || !targetUsername) {
    return ctx.reply('Usage: /transfer <amount> <@username>');
  }

  const senderId = await resolveUserId(ctx.from.id.toString());
  const result = await transferPCU({
    fromUserId: senderId,
    toUsername: targetUsername,
    amountPcu: amount,
    logger,
  });

  if (!result.success) {
    return ctx.reply(result.errorMessage || 'Transfer failed.');
  }

  await ctx.reply(`Transferred ${amount} PCU to @${targetUsername}`);
});

bot.command('resetmeter', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  await resetmeterCommand(ctx, userId, logger);
});

bot.action(/^resetmeter_type_(.+)$/, async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const meterType = ctx.match[1] as MeterType;
  await resetmeterTypeCallback(ctx, userId, meterType, logger);
});

bot.action('resetmeter_confirm_yes', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  await resetmeterConfirmCallback(ctx, userId, true, logger);
});

bot.action('resetmeter_confirm_no', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  await resetmeterConfirmCallback(ctx, userId, false, logger);
});

bot.action(/^metertype:(grid_import|solar_export)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const telegramId = ctx.from.id.toString();
  const pending = await getPendingReading(telegramId);
  if (!pending || pending.stage !== 'awaiting_meter_type') {
    await ctx.editMessageText('Session expired. Send the photo again.');
    return;
  }

  const userId = await resolveUserId(telegramId);
  const meterType = ctx.match[1] as Extract<MeterType, 'grid_import' | 'solar_export'>;
  const ocrResult: MeterOcrResult = {
    ...pending.ocrResult,
    meterType,
  };

  await processAndSaveReading(
    ctx,
    userId,
    telegramId,
    ocrResult,
    pending.imageUrl,
    crypto.randomUUID(),
    ctx.callbackQuery.message?.message_id
  );
});

bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const kwh = parseFloat(parts[1]);
  const meterType: MeterType = (parts[2] as MeterType) || 'unknown';

  if (Number.isNaN(kwh) || kwh <= 0) {
    return ctx.reply('Usage: /read <kWh> [type]  e.g. /read 152.61 solar_export');
  }

  const userId = await resolveUserId(ctx.from.id.toString());
  const { clusterId, unitId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await ctx.reply('Join a community first. Use /clusters.');
    await promptForCluster(ctx);
    return;
  }

  const requestId = crypto.randomUUID();
  const validation = await validateReading({
    userId,
    clusterId,
    newKwh: kwh,
    confidence: 1.0,
    meterType,
    requestId,
    logger,
  });

  if (!validation.valid) {
    return ctx.reply(`Rejected\n\n${validation.reason}`);
  }

  const period = getCurrentPeriod();
  const readingKey = generateReadingKey(userId, clusterId, meterType, period, kwh);

  const { data: reading, error } = await supabase
    .from('meter_readings')
    .insert({
      user_id: userId,
      cluster_id: clusterId,
      unit_id: unitId,
      reading_kwh: kwh,
      meter_type: meterType,
      validated: true,
      captured_at: new Date().toISOString(),
      reporting_period: period,
      source: 'telegram_manual',
      delta_kwh: validation.delta ?? 0,
      reading_key: readingKey,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    logger.error({ error, userId }, 'Failed to insert manual reading');
    return ctx.reply('Failed to save reading.');
  }

  if (!reading) {
    return ctx.reply('Reading saved but response was empty.');
  }

  const valueResult = await handleReadingValueAndPayout(
    ctx,
    userId,
    clusterId,
    reading as ReadingRecord,
    validation as ValidationResult,
    requestId
  );

  const isFirstReading = validation.flag === 'first_reading';
  const isAfterReset = validation.flag === 'after_reset';
  const messageText = formatReadingMessage(
    kwh,
    validation.prevKwh ?? null,
    validation.delta ?? null,
    meterType,
    period,
    clusterId,
    valueResult,
    isFirstReading,
    isAfterReset
  );

  await ctx.reply(messageText, { parse_mode: 'Markdown' });
});

bot.on(message('photo'), async (ctx) => {
  const photo = ctx.message.photo.slice(-1)[0];
  const telegramId = ctx.from.id.toString();

  const userId = await resolveUserId(telegramId, {
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
  });

  const { clusterId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await setPendingReading(telegramId, {
      stage: 'awaiting_cluster',
      fileId: photo.file_id,
      chatId: ctx.chat.id,
      expiresAt: Date.now() + PENDING_TTL_SECONDS * 1000,
    });

    await ctx.reply('Choose a community first. I will process this photo once you join.');
    await promptForCluster(ctx);
    return;
  }

  const rateCheck = await rateLimiter.check(telegramId);
  if (!rateCheck.allowed) {
    return ctx.reply(`Rate limit reached. Try again in ${rateCheck.retryAfterSeconds}s.`);
  }

  const statusMsg = await ctx.reply('Reading your meter...');
  await processPhotoFile(ctx, userId, telegramId, photo.file_id, statusMsg.message_id);
});

bot.on(message('text'), async (ctx, next) => {
  const telegramId = ctx.from.id.toString();

  // State-dependent flow: awaiting phone number
  if (ctx.session.awaitingPhone) {
    const normalized = normalizePhoneNumber(ctx.message.text);
    if (!normalized) {
      return ctx.reply('Invalid number. Try +260XXXXXXXXX or 097XXXXXXX.');
    }

    const { error } = await supabase
      .from('telegram_users')
      .update({ phone_number: normalized, updated_at: new Date().toISOString() })
      .eq('telegram_id', telegramId);

    if (error) {
      logger.error({ error, telegramId }, 'Failed to save phone number');
      return ctx.reply('Failed to save number. Please try again.');
    }

    ctx.session.awaitingPhone = false;
    return ctx.reply(
      `Number registered: ${normalized}\n\nSend a meter photo to log a reading and start earning.`,
      { parse_mode: 'Markdown' }
    );
  }

  // State-dependent flow: pending redemption confirmation
  const userId = await resolveUserId(telegramId);
  const pending = await getPendingRedemption(userId);
  if (pending && Date.now() < pending.expiresAt && ctx.message.text.trim().toUpperCase() === 'YES') {
    await clearPendingRedemption(userId);

    try {
      const fxRate = await getLiveExchangeRate();
      const amountZmw = pending.amountPcu * fxRate;

      const payout = await requestLencoPayout(
        {
          userId: pending.userId,
          clusterId: pending.clusterId,
          amount: amountZmw,
          phoneNumber: pending.phone,
          narration: `PCU Redemption - ${pending.amountPcu} PCU`,
          reference: pending.reference,
          idempotencyKey: pending.reference,
        },
        logger
      );

      await ctx.reply(
        `*Settlement Complete*\n\n` +
          `Amount\nK${amountZmw.toFixed(2)}\n\n` +
          `Recipient\n${maskPhone(pending.phone)}\n\n` +
          `Reference\n${payout.reference}\n\n` +
          `Status\nSUCCESS\n\n` +
          `SMS confirmation arriving shortly.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ err: error.message }, 'Redemption failed');
      return ctx.reply(`Redemption failed: ${error.message}`);
    }
  }

  return next();
});

bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, 'Bot error');
  ctx.reply('An unexpected error occurred. Our team has been notified.');
});

process.once('SIGINT', () => {
  logger.info('SIGINT received');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  logger.info('SIGTERM received');
  bot.stop('SIGTERM');
});

// ─── Bot Launch ──────────────────────────────────────────────────────
const WEBHOOK_URL = process.env.WEBHOOK_URL;

setTimeout(() => {
  if (WEBHOOK_URL) {
    // Production: webhook via Express (shares port with health check)
    bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
    app.use(bot.webhookCallback('/webhook'));
    app.listen(Number(PORT), () => {
      logger.info(`Ellie is online via webhook on port ${PORT}`);
    });
  } else {
    // Development: polling
    bot
      .launch()
      .then(() => logger.info('Ellie is online via polling!'))
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.fatal({ err: error.message }, 'Bot polling launch failed');
        process.exit(1);
      });
  }
}, WEBHOOK_URL ? 1000 : 10000);