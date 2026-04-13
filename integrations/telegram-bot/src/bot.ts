// integrations/telegram-bot/src/bot.ts
// Production-ready Ellie bot with cluster browsing, manual fallback, and settlement.
// Language: clean, no emojis, no hardcoded country/provider jargon.

import dotenv from 'dotenv';
dotenv.config();

import { Telegraf, Context, session } from 'telegraf';
import { message } from 'telegraf/filters';
import express from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import crypto from 'node:crypto';

import { readMeterOCR, MeterOcrResult, setLogger as setOcrLogger } from './services/ocr';
import { validateReading } from './services/validation';
import { calculateValue } from './services/tariff-calculator';
import { OCRRateLimiter } from './services/rate-limiter';
import { requestLencoPayout } from './services/settlement';

// ====================== CONFIGURATION ======================
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
setOcrLogger(logger);

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const rateLimiter = new OCRRateLimiter(logger);

// Default cluster for auto‑enrollment (override via env)
const DEFAULT_CLUSTER_ID = process.env.DEFAULT_CLUSTER_ID || 'clu_73x96b83';

// ====================== EXPRESS HEALTH CHECK ======================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Ellie is awake and monitoring the grid.'));
app.listen(PORT, () => logger.info(`Health check listening on port ${PORT}`));

// ====================== SESSION TYPE ======================
interface BotSession {
  clusterId?: string;
  pendingReading?: {
    imageUrl: string;
    ocrResult: MeterOcrResult;
    expiresAt: number;
  };
  awaitingPhone?: boolean;
}

interface BotContext extends Context {
  session: BotSession;
}

// ====================== BOT SETUP ======================
const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);
bot.use(session({ defaultSession: (): BotSession => ({}) }));

// ====================== HELPERS ======================
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizePhoneNumber(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '');
  let n = cleaned;
  // Accept common formats and normalize to +260...
  if (n.startsWith('0')) n = '+260' + n.slice(1);
  if (n.startsWith('260')) n = '+' + n;
  // Basic validation for Zambian mobile numbers (9 digits after country code)
  return /^\+260\d{9}$/.test(n) ? n : null;
}

/**
 * Resolve Telegram ID → stable UUID.
 * Uses telegram_users table with auto-generated user_id (no Auth dependency).
 */
async function resolveUserId(
  telegramId: string,
  profile?: { username?: string; first_name?: string; last_name?: string }
): Promise<string> {
  const { data, error } = await supabase
    .from('telegram_users')
    .upsert(
      {
        telegram_id: telegramId,
        username:    profile?.username   ?? null,
        first_name:  profile?.first_name ?? null,
        last_name:   profile?.last_name  ?? null,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'telegram_id' }
    )
    .select('user_id')
    .single();

  if (error) {
    logger.error({ err: error, telegramId }, 'Failed to resolve user');
    throw new Error('Unable to set up your account. Please try again later.');
  }

  return data.user_id;
}

async function getPhoneNumber(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .single();
  return data?.phone_number ?? null;
}

/**
 * Returns the user's cluster. Never throws.
 * Priority: session → cluster_members → DEFAULT_CLUSTER_ID (auto‑enroll).
 */
async function resolveCluster(
  ctx: BotContext,
  userId: string
): Promise<{ clusterId: string; unitId: string }> {
  // 1. Session
  if (ctx.session.clusterId) {
    return { clusterId: ctx.session.clusterId, unitId: 'A1' };
  }

  // 2. Existing membership
  const { data: member } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(1)
    .single();

  if (member?.cluster_id) {
    ctx.session.clusterId = member.cluster_id;
    return { clusterId: member.cluster_id, unitId: 'A1' };
  }

  // 3. Auto‑enroll into default cluster
  logger.info({ userId }, 'No cluster membership — auto‑enrolling into default cluster');
  await supabase.from('cluster_members').insert({
    cluster_id: DEFAULT_CLUSTER_ID,
    user_id: userId,
  });
  ctx.session.clusterId = DEFAULT_CLUSTER_ID;
  return { clusterId: DEFAULT_CLUSTER_ID, unitId: 'A1' };
}

async function getUserConsent(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .single();
  return !!data?.phone_number;
}

// ====================== CORE PROCESSING ======================
async function processAndSaveReading(
  ctx: BotContext,
  userId: string,
  ocrResult: MeterOcrResult,
  imageUrl: string,
  requestId: string,
  editMessageId?: number
): Promise<void> {
  const editOrReply = async (text: string, extra?: any) => {
    if (editMessageId) {
      return ctx.telegram.editMessageText(
        ctx.chat!.id, editMessageId, undefined, text, extra
      ).catch(() => ctx.reply(text, extra));
    }
    return ctx.reply(text, extra);
  };

  try {
    const { clusterId, unitId } = await resolveCluster(ctx, userId);

    const validation = await validateReading({
      userId,
      clusterId,
      newKwh: ocrResult.kwh!,
      confidence: ocrResult.confidence,
      meterType: ocrResult.meterType,
      requestId,
      logger,
    });

    if (!validation.valid) {
      await editOrReply(`Reading rejected: ${validation.reason}`);
      return;
    }

    // Save reading
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
        reporting_period: getCurrentPeriod(),
        source: 'telegram',
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error({ error: insertError }, 'Failed to save reading');
      await editOrReply('Database error. Please try again.');
      return;
    }

    const deltaText = validation.delta
      ? `${validation.delta > 0 ? '+' : ''}${validation.delta.toFixed(2)} kWh`
      : 'First reading';

    let valueMessage = '';
    const hasPhone = await getUserConsent(userId);

    if (hasPhone && validation.delta && validation.delta > 0) {
      try {
        const value = await calculateValue(
          validation.delta,
          ocrResult.meterType,
          userId,
          clusterId,
          requestId,
          logger,
          { consentGiven: true }
        );

        valueMessage =
          `\n*Estimated Value*\n` +
          `Gross: K${value.grossValue.toFixed(2)}\n` +
          `Rate: K${value.effectiveRate}/kWh\n` +
          `Net: K${value.netValue.toFixed(2)}\n`;

        const phone = await getPhoneNumber(userId);
        if (phone && value.netValue >= 1) {
          try {
            const payout = await requestLencoPayout({
              userId,
              clusterId,
              readingId: reading.id,
              amount: value.netValue,
              phoneNumber: phone,
              narration: `Enerlectra credit – ${validation.delta!.toFixed(2)} kWh`,
            }, logger);

            valueMessage +=
              `\n*Payout initiated*\n` +
              `Ref: \`${payout.reference}\`\n` +
              `Status: ${payout.status}\n` +
              `To: ${phone}\n`;
          } catch (err) {
            logger.error({ err }, 'Payout failed');
            valueMessage += `\nPayout failed – reading saved. Support will follow up.`;
          }
        } else if (phone) {
          valueMessage += `\nPayout below K1 deferred.`;
        }
      } catch (err) {
        logger.error({ err }, 'Value calculation failed');
        valueMessage = `\nValue estimation unavailable.`;
      }
    } else if (!hasPhone && validation.delta && validation.delta > 0) {
      valueMessage = `\nRegister your mobile number to receive payments:\n/register`;
    }

    await editOrReply(
      `*Reading accepted!*\n` +
      `Value: ${ocrResult.kwh} kWh\n` +
      `Change: ${deltaText}\n` +
      `Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
      `Period: ${getCurrentPeriod()}\n` +
      `Community: \`${clusterId}\`\n` +
      valueMessage +
      `\n_Estimates only. Official credits handled separately._`,
      { parse_mode: 'Markdown' }
    );

    ctx.session.pendingReading = undefined;
  } catch (error: any) {
    logger.error({ error }, 'Processing error');
    await editOrReply(`Failed to save reading: ${error.message}`);
  }
}

// ====================== COMMANDS ======================
bot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload as string | undefined;
  const from = ctx.from;
  const telegramId = from.id.toString();

  const userId = await resolveUserId(telegramId, {
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
  });

  // Deep link – set cluster from QR code
  if (startPayload) {
    try {
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const parts = decoded.split('|');
      const clusterId = parts.find(p => p.startsWith('c:'))?.replace('c:', '');
      const unitId = parts.find(p => p.startsWith('u:'))?.replace('u:', '');

      if (clusterId) {
        ctx.session.clusterId = clusterId;

        await supabase.from('cluster_members').upsert(
          { cluster_id: clusterId, user_id: userId },
          { onConflict: 'cluster_id,user_id' }
        );

        const phone = await getPhoneNumber(userId);
        await ctx.reply(
          `*Welcome to Enerlectra!*\n\n` +
          `Community: \`${clusterId}\`\n` +
          `Unit: \`${unitId ?? 'A1'}\`\n\n` +
          (phone
            ? `You're set. Send a meter photo to log a reading.`
            : `Register your mobile number to receive payments:\n/register`),
          { parse_mode: 'Markdown' }
        );
        return;
      }
    } catch (e) {
      logger.error({ e }, 'Payload decode error');
    }
  }

  // No deep link – auto‑resolve cluster silently
  await resolveCluster(ctx, userId);
  const phone = await getPhoneNumber(userId);

  await ctx.reply(
    `Hello! I'm *Ellie*, your Enerlectra assistant.\n\n` +
    (phone ? '' : `Register your mobile number: /register\n\n`) +
    `Commands:\n` +
    `Send a meter photo to submit a reading\n` +
    `/read <kWh> – Submit manually\n` +
    `/register – Add mobile number\n` +
    `/status – Your account info\n` +
    `/clusters – Browse & join energy communities`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('clusters', async (ctx) => {
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, name, location, status')
    .in('status', ['ACTIVE', 'FUNDING', 'active', 'funding'])
    .order('name')
    .limit(10);

  if (!clusters || clusters.length === 0) {
    return ctx.reply('No communities available. Contact your administrator.');
  }

  const keyboard = clusters.map((c: any) => [{
    text: `${c.name}${c.location ? ` · ${c.location}` : ''}`,
    callback_data: `join_cluster:${c.id}`,
  }]);

  await ctx.reply(
    `*Available Energy Communities*\n\nSelect one to join:`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    }
  );
});

bot.action(/^join_cluster:/, async (ctx) => {
  await ctx.answerCbQuery();
  const clusterId = ctx.callbackQuery?.data?.replace('join_cluster:', '') ?? '';
  if (!clusterId) return;

  const telegramId = ctx.from!.id.toString();
  const userId = await resolveUserId(telegramId, {
    username: ctx.from!.username,
    first_name: ctx.from!.first_name,
    last_name: ctx.from!.last_name,
  });

  await supabase.from('cluster_members').upsert(
    { cluster_id: clusterId, user_id: userId },
    { onConflict: 'cluster_id,user_id' }
  );

  ctx.session.clusterId = clusterId;

  const { data: cluster } = await supabase
    .from('clusters')
    .select('name')
    .eq('id', clusterId)
    .single();

  const phone = await getPhoneNumber(userId);

  await ctx.editMessageText(
    `*Joined ${cluster?.name ?? clusterId}*\n\n` +
    (phone
      ? `Send a meter photo to log a reading.`
      : `Register your mobile number to receive payments:\n/register`),
    { parse_mode: 'Markdown' }
  );
});

bot.command('register', async (ctx) => {
  ctx.session.awaitingPhone = true;
  await ctx.reply(
    `*Register your mobile number*\n\nReply with your number:\n\`+260971234567\` or \`0971234567\``,
    { parse_mode: 'Markdown' }
  );
});

bot.command('status', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);
  const phone = await getPhoneNumber(userId);
  const { clusterId } = await resolveCluster(ctx, userId);

  await ctx.reply(
    `*Your Enerlectra Status*\n\n` +
    `Community: \`${clusterId}\`\n` +
    `Mobile: ${phone ?? 'Not registered – /register'}\n` +
    `Period: ${getCurrentPeriod()}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const readingKwh = parseFloat(parts[1]);

  if (isNaN(readingKwh) || readingKwh <= 0) {
    return ctx.reply('Usage: `/read <kWh>`  e.g. `/read 8430.6`', { parse_mode: 'Markdown' });
  }

  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId, {
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
  });
  const requestId = crypto.randomUUID();
  const { clusterId, unitId } = await resolveCluster(ctx, userId);

  const validation = await validateReading({
    userId,
    clusterId,
    newKwh: readingKwh,
    confidence: 1.0,
    meterType: 'unknown',
    requestId,
    logger,
  });

  if (!validation.valid) {
    return ctx.reply(`Reading rejected: ${validation.reason}`);
  }

  try {
    await supabase.from('meter_readings').insert({
      user_id: userId,
      cluster_id: clusterId,
      unit_id: unitId,
      reading_kwh: readingKwh,
      meter_type: 'unknown',
      validated: true,
      captured_at: new Date().toISOString(),
      reporting_period: getCurrentPeriod(),
      source: 'telegram_manual',
    });

    await ctx.reply(`Manual reading recorded: *${readingKwh} kWh*`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    logger.error({ err }, 'Manual reading failed');
    ctx.reply('Failed to submit reading. ' + err.message);
  }
});

// ====================== TEXT HANDLER (phone registration) ======================
bot.on(message('text'), async (ctx, next) => {
  if (!ctx.session.awaitingPhone) return next();

  const normalized = normalizePhoneNumber(ctx.message.text);
  if (!normalized) {
    await ctx.reply(
      'Invalid number. Try:\n`+260971234567` or `0971234567`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const telegramId = ctx.from.id.toString();
  const { error } = await supabase
    .from('telegram_users')
    .update({ phone_number: normalized, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);

  if (error) {
    logger.error({ err: error }, 'Failed to save phone number');
    await ctx.reply('Failed to save number. Please try again.');
    return;
  }

  ctx.session.awaitingPhone = false;
  await ctx.reply(
    `*Mobile number registered:* ${normalized}\n\nSend a meter photo to log a reading.`,
    { parse_mode: 'Markdown' }
  );
});

// ====================== PHOTO HANDLER ======================
bot.on(message('photo'), async (ctx) => {
  const photo = ctx.message.photo.slice(-1)[0];
  const from = ctx.from;
  const telegramId = from.id.toString();

  const userId = await resolveUserId(telegramId, {
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
  });

  const requestId = crypto.randomUUID();

  const rateCheck = await rateLimiter.check(telegramId);
  if (!rateCheck.allowed) {
    await ctx.reply(`Rate limit reached. Try again in ${rateCheck.retryAfterSeconds}s.`);
    return;
  }

  const statusMsg = await ctx.reply('Reading your meter...');

  try {
    const file = await ctx.telegram.getFile(photo.file_id);
    const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const ocrResult = await readMeterOCR(imageUrl, { requestId });

    // Manual required (credits exhausted / both engines failed)
    if (ocrResult.status === 'manual_required') {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `Photo received, but automatic reading is temporarily unavailable.\n\n` +
        `Please enter your reading manually:\n` +
        `/read <value>  e.g. /read 152.61`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Complete failure
    if (ocrResult.status === 'failed' || ocrResult.kwh === null) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `Could not read the meter.\n\n${ocrResult.error || 'No numbers detected'}\n\n` +
        `Tips for a better photo:\n` +
        `- Hold phone steady, parallel to meter\n` +
        `- Ensure display is fully lit\n` +
        `- Avoid glare – angle phone slightly\n\n` +
        `Or enter manually: /read <value>`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Low confidence or Claude result — always confirm
    if (ocrResult.status === 'review' || ocrResult.confidence < 0.80) {
      ctx.session.pendingReading = {
        imageUrl,
        ocrResult,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };

      const sourceNote = ocrResult.source === 'claude_vision'
        ? '\n_AI vision reading – please verify carefully._'
        : '';

      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `*Reading detected:* ${ocrResult.kwh} kWh\n` +
        `Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
        `Confidence: ${(ocrResult.confidence * 100).toFixed(0)}%${sourceNote}\n\n` +
        `Is this correct?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Yes, save it', callback_data: 'confirm:yes' }],
              [{ text: 'No, cancel', callback_data: 'confirm:no' }],
              [{ text: 'Enter manually', callback_data: 'confirm:manual' }],
            ],
          },
        }
      );
      return;
    }

    // High confidence Tesseract — save immediately
    await processAndSaveReading(ctx, userId, ocrResult, imageUrl, requestId, statusMsg.message_id);

  } catch (error) {
    logger.error({ error, userId }, 'Photo handler error');
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, undefined,
      'An unexpected error occurred. Please try again.'
    ).catch(() => ctx.reply('An unexpected error occurred.'));
  }
});

// ====================== CALLBACK HANDLER ======================
bot.on('callback_query', async (ctx) => {
  const data = (ctx.callbackQuery as any).data as string | undefined;
  if (!data?.startsWith('confirm:')) return;

  await ctx.answerCbQuery();
  const action = data.split(':')[1];

  const pending = ctx.session.pendingReading;
  if (!pending || Date.now() > pending.expiresAt) {
    await ctx.editMessageText('Session expired. Please send the photo again.');
    return;
  }

  const telegramId = ctx.from!.id.toString();
  const userId = await resolveUserId(telegramId);
  const requestId = crypto.randomUUID();

  if (action === 'yes') {
    await processAndSaveReading(
      ctx, userId, pending.ocrResult, pending.imageUrl,
      requestId, (ctx.callbackQuery as any).message?.message_id
    );
  } else if (action === 'no') {
    ctx.session.pendingReading = undefined;
    await ctx.editMessageText('Reading cancelled. Send a new photo when ready.');
  } else if (action === 'manual') {
    ctx.session.pendingReading = undefined;
    await ctx.editMessageText('Enter the reading manually:\n`/read <value>`', { parse_mode: 'Markdown' });
  }
});

// ====================== ERROR HANDLER ======================
bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, 'Bot error');
  ctx.reply('An unexpected error occurred. Our team has been notified.');
});

// ====================== GRACEFUL SHUTDOWN ======================
process.once('SIGINT', () => { logger.info('SIGINT received'); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { logger.info('SIGTERM received'); bot.stop('SIGTERM'); });

// ====================== LAUNCH ======================
bot.launch()
  .then(() => logger.info('Ellie is online!'))
  .catch(err => logger.error({ err }, 'Bot launch failed'));
