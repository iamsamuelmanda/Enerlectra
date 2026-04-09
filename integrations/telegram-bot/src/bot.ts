import dotenv from 'dotenv';
dotenv.config();

// index.ts
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

// ====================== CONFIGURATION ======================
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
setOcrLogger(logger);

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const rateLimiter = new OCRRateLimiter(logger);

// ====================== EXPRESS HEALTH CHECK ======================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Ellie is awake and monitoring the grid! ⚡'));
app.listen(PORT, () => logger.info(`Health check listening on port ${PORT}`));

// ====================== TELEGRAF BOT ======================
interface BotSession {
  pendingReading?: {
    imageUrl: string;
    ocrResult: MeterOcrResult;
    expiresAt: number;
  };
}

interface BotContext extends Context {
  session: BotSession;
}

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);
bot.use(session({ defaultSession: () => ({}) }));

// ====================== HELPER FUNCTIONS ======================
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Resolve Telegram ID → Supabase UUID (creates user if needed)
async function resolveUserId(telegramId: string): Promise<string> {
  const { data, error } = await supabase
    .from('telegram_users')
    .upsert(
      { telegram_id: telegramId },
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

async function getUserActiveCluster(userId: string): Promise<{ clusterId: string; unitId: string }> {
  // 1. Check public.users for default_cluster_id
  const { data: profile } = await supabase
    .from('users')
    .select('default_cluster_id')
    .eq('id', userId)
    .single();

  if (profile?.default_cluster_id) {
    return { clusterId: profile.default_cluster_id, unitId: 'A1' };
  }

  // 2. Fallback to cluster_members
  const { data: member, error } = await supabase
    .from('cluster_members')
    .select('cluster_id, unit_id')
    .eq('user_id', userId)
    .single();

  if (error || !member) {
    throw new Error('No active cluster found. Please join a cluster first.');
  }

  return { clusterId: member.cluster_id, unitId: member.unit_id || 'A1' };
}

async function getUserConsent(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('consent_given')
    .eq('id', userId)
    .single();
  return data?.consent_given ?? false;
}

// Core processing function
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
      return ctx.telegram.editMessageText(ctx.chat!.id, editMessageId, undefined, text, extra);
    }
    return ctx.reply(text, extra);
  };

  try {
    const { clusterId, unitId } = await getUserActiveCluster(userId);

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
      await editOrReply(`⚠️ Reading rejected: ${validation.reason}`);
      return;
    }

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
        reporting_period: getCurrentPeriod(),
        source: 'telegram',
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error({ error: insertError }, 'Failed to save reading');
      await editOrReply('❌ Database error. Please try again.');
      return;
    }

    let valueMessage = '';
    const consentGiven = await getUserConsent(userId);

    if (consentGiven && validation.delta && validation.delta > 0) {
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
          `\n💰 *Estimated Value* (ZMW)\n` +
          `• Gross: ${value.grossValue} ZMW\n` +
          `• Effective rate: ${value.effectiveRate} K/kWh\n` +
          `• Net estimate: ${value.netValue} ZMW\n`;
      } catch (err) {
        logger.error({ err }, 'Value calculation failed');
        valueMessage = `\n⚠️ Value estimation unavailable.`;
      }
    } else if (validation.delta && validation.delta > 0 && !consentGiven) {
      valueMessage = `\n📊 Want to see estimated value? Use /consent to enable.`;
    }

    const deltaText = validation.delta
      ? `${validation.delta > 0 ? '+' : ''}${validation.delta.toFixed(2)} kWh`
      : 'First reading';

    await editOrReply(
      `✅ *Reading accepted!*\n` +
      `• Value: ${ocrResult.kwh} kWh\n` +
      `• Change: ${deltaText}\n` +
      `• Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
      `• Period: ${getCurrentPeriod()}\n` +
      valueMessage +
      `\n⚠️ This is an estimate only. Official ZESCO credits are handled separately.`,
      { parse_mode: 'Markdown' }
    );

    ctx.session.pendingReading = undefined;

  } catch (error) {
    logger.error({ error }, 'Processing error');
    await editOrReply('❌ Failed to save reading. Please try again.');
  }
}

// ====================== BOT COMMANDS ======================
bot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload;
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);

  if (startPayload) {
    try {
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const parts = decoded.split('|');
      const clusterId = parts.find(p => p.startsWith('c:'))?.replace('c:', '');
      const unitId = parts.find(p => p.startsWith('u:'))?.replace('u:', '');

      if (clusterId && unitId) {
        await supabase.from('users').upsert({
          id: userId,
          default_cluster_id: clusterId,
        }, { onConflict: 'id' });

        return ctx.reply(
          `👋 *Context Verified!*\n\n` +
          `Cluster: \`${clusterId}\`\n` +
          `Unit: \`${unitId}\`\n\n` +
          `Send a **photo** of your meter to log a reading.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (e) {
      logger.error({ e }, 'Payload decode error');
    }
  }

  ctx.reply(
    '👋 Hello! I am *Ellie*, your Enerlectra assistant.\n\n' +
    'Commands:\n' +
    '📸 Send a meter photo to submit a reading\n' +
    '⚡ `/read <kWh>` — Submit manually\n' +
    '📊 `/consent` — Enable value estimates\n',
    { parse_mode: 'Markdown' }
  );
});

bot.command('consent', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);

  await supabase
    .from('users')
    .upsert({
      id: userId,
      consent_given: true,
      consent_given_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  await ctx.reply(
    '✅ Consent recorded. You will now see estimated ZMW values.\n\n' +
    'Revoke with `/revoke_consent`.'
  );
});

bot.command('revoke_consent', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);

  await supabase
    .from('users')
    .upsert({
      id: userId,
      consent_given: false,
      consent_given_at: null,
    }, { onConflict: 'id' });

  await ctx.reply('❌ Consent revoked.');
});

bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const readingKwh = parseFloat(parts[1]);

  if (isNaN(readingKwh)) {
    return ctx.reply('❌ Usage: `/read <kWh>`');
  }

  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);
  const requestId = crypto.randomUUID();

  try {
    const { clusterId, unitId } = await getUserActiveCluster(userId);

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
      return ctx.reply(`⚠️ Reading rejected: ${validation.reason}`);
    }

    await supabase.from('meter_readings').insert({
      user_id: userId,
      cluster_id: clusterId,
      unit_id: unitId,
      reading_kwh: readingKwh,
      meter_type: 'unknown',
      validated: true,
      reporting_period: getCurrentPeriod(),
      source: 'telegram_manual',
    });

    await ctx.reply(`✅ Manual reading recorded: *${readingKwh} kWh*`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    logger.error({ err }, 'Manual reading failed');
    ctx.reply('❌ Failed to submit reading. ' + err.message);
  }
});

// ====================== PHOTO HANDLER ======================
bot.on(message('photo'), async (ctx) => {
  const photo = ctx.message.photo.slice(-1)[0];
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);
  const requestId = crypto.randomUUID();

  const rateCheck = await rateLimiter.check(telegramId);
  if (!rateCheck.allowed) {
    await ctx.reply(`⏳ Rate limit reached. Try again in ${rateCheck.retryAfterSeconds} seconds.`);
    return;
  }

  const statusMsg = await ctx.reply('⏳ Processing meter photo...');

  try {
    const file = await ctx.telegram.getFile(photo.file_id);
    const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const ocrResult = await readMeterOCR(imageUrl, { requestId });

    if (ocrResult.status === 'failed' || ocrResult.kwh === null) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `❌ Could not read the meter.\n\nReason: ${ocrResult.error || 'No numbers detected'}\n\nTry /read <value>.`
      );
      return;
    }

    if (ocrResult.confidence < 0.80) {
      ctx.session.pendingReading = {
        imageUrl,
        ocrResult,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `📸 Reading detected: *${ocrResult.kwh} kWh*\n` +
        `Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
        `Confidence: ${(ocrResult.confidence * 100).toFixed(0)}%\n\n` +
        `Is this correct?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, save', callback_data: 'confirm:yes' }],
              [{ text: '❌ No, cancel', callback_data: 'confirm:no' }],
              [{ text: '✏️ Enter manually', callback_data: 'confirm:manual' }],
            ],
          },
        }
      );
      return;
    }

    await processAndSaveReading(ctx, userId, ocrResult, imageUrl, requestId, statusMsg.message_id);

  } catch (error) {
    logger.error({ error, userId }, 'Photo handler error');
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      '❌ An unexpected error occurred. Please try again.'
    );
  }
});

// ====================== CALLBACK HANDLER ======================
bot.on('callback_query', async (ctx) => {
  const data = (ctx.callbackQuery as any).data;
  if (!data || !data.startsWith('confirm:')) return;

  await ctx.answerCbQuery();
  const action = data.split(':')[1];

  const pending = ctx.session.pendingReading;
  if (!pending || Date.now() > pending.expiresAt) {
    await ctx.editMessageText('⏰ Session expired. Please send the photo again.');
    return;
  }

  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);
  const requestId = crypto.randomUUID();

  if (action === 'yes') {
    await processAndSaveReading(
      ctx,
      userId,
      pending.ocrResult,
      pending.imageUrl,
      requestId,
      ctx.callbackQuery.message?.message_id
    );
  } else if (action === 'no') {
    await ctx.editMessageText('❌ Reading cancelled. Please send a new photo.');
    ctx.session.pendingReading = undefined;
  } else if (action === 'manual') {
    await ctx.editMessageText(`Please enter the reading manually using:\n/read <value>`);
    ctx.session.pendingReading = undefined;
  }
});

// ====================== ERROR HANDLER ======================
bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, 'Bot error');
  ctx.reply('❌ An unexpected error occurred. Our team has been notified.');
});

// ====================== GRACEFUL SHUTDOWN ======================
process.once('SIGINT', () => {
  logger.info('SIGINT received, stopping bot...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  logger.info('SIGTERM received, stopping bot...');
  bot.stop('SIGTERM');
});

// ====================== LAUNCH ======================
bot.launch()
  .then(() => logger.info('🤖 Ellie bot is online!'))
  .catch(err => logger.error({ err }, 'Bot launch failed'));