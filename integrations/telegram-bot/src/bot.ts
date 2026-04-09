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

// ====================== EXPRESS HEALTH CHECK ======================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Ellie is awake and monitoring the grid! ⚡'));
app.listen(PORT, () => logger.info(`Health check listening on port ${PORT}`));

// ====================== SESSION TYPE ======================
interface BotSession {
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

function normalizeZambianPhone(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '');
  let normalized = cleaned;
  if (normalized.startsWith('0'))      normalized = '+260' + normalized.slice(1);
  if (normalized.startsWith('260'))    normalized = '+' + normalized;
  if (!/^\+260\d{9}$/.test(normalized)) return null;
  return normalized;
}

// Upsert telegram_users row and return the stable user_id UUID.
// No Auth involved — telegram_id is the identity.
async function resolveUserId(
  telegramId: string,
  profile?: { username?: string; first_name?: string; last_name?: string }
): Promise<string> {
  const { data, error } = await supabase
    .from('telegram_users')
    .upsert(
      {
        telegram_id:  telegramId,
        username:     profile?.username   ?? null,
        first_name:   profile?.first_name ?? null,
        last_name:    profile?.last_name  ?? null,
        updated_at:   new Date().toISOString(),
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

async function getUserActiveCluster(userId: string): Promise<{ clusterId: string; unitId: string }> {
  const { data: profile } = await supabase
    .from('users')
    .select('default_cluster_id')
    .eq('id', userId)
    .single();

  if (profile?.default_cluster_id) {
    return { clusterId: profile.default_cluster_id, unitId: 'A1' };
  }

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
      return ctx.telegram.editMessageText(ctx.chat!.id, editMessageId, undefined, text, extra);
    }
    return ctx.reply(text, extra);
  };

  try {
    const { clusterId, unitId } = await getUserActiveCluster(userId);

    const validation = await validateReading({
      userId,
      clusterId,
      newKwh:     ocrResult.kwh!,
      confidence: ocrResult.confidence,
      meterType:  ocrResult.meterType,
      requestId,
      logger,
    });

    if (!validation.valid) {
      await editOrReply(`⚠️ Reading rejected: ${validation.reason}`);
      return;
    }

    // Save reading
    const { data: reading, error: insertError } = await supabase
      .from('meter_readings')
      .insert({
        user_id:          userId,
        cluster_id:       clusterId,
        unit_id:          unitId,
        reading_kwh:      ocrResult.kwh,
        meter_type:       ocrResult.meterType,
        photo_url:        imageUrl,
        ocr_confidence:   ocrResult.confidence,
        validated:        true,
        reporting_period: getCurrentPeriod(),
        source:           'telegram',
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error({ error: insertError }, 'Failed to save reading');
      await editOrReply('❌ Database error. Please try again.');
      return;
    }

    const deltaText = validation.delta
      ? `${validation.delta > 0 ? '+' : ''}${validation.delta.toFixed(2)} kWh`
      : 'First reading';

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
          `\n💰 *Estimated Value*\n` +
          `• Gross: K${value.grossValue.toFixed(2)}\n` +
          `• Rate: K${value.effectiveRate}/kWh\n` +
          `• Net: K${value.netValue.toFixed(2)}\n`;

        // Attempt Lenco payout
        const phone = await getPhoneNumber(userId);

        if (phone) {
          try {
            const payout = await requestLencoPayout({
              userId,
              clusterId,
              readingId:   reading.id,
              amount:      value.netValue,
              phoneNumber: phone,
              narration:   `Enerlectra credit – ${validation.delta.toFixed(2)} kWh`,
            }, logger);

            valueMessage +=
              `\n💸 *Payout initiated*\n` +
              `• Ref: \`${payout.reference}\`\n` +
              `• Status: ${payout.status}\n` +
              `• To: ${phone}\n`;
          } catch (err) {
            logger.error({ err }, 'Lenco payout failed');
            valueMessage += `\n⚠️ Payout failed — reading saved. Support will follow up.`;
          }
        } else {
          valueMessage +=
            `\n📱 Add your MoMo number to receive K${value.netValue.toFixed(2)}:\n` +
            `Use /register`;
        }

      } catch (err) {
        logger.error({ err }, 'Value calculation failed');
        valueMessage = `\n⚠️ Value estimation unavailable.`;
      }
    } else if (validation.delta && validation.delta > 0 && !consentGiven) {
      valueMessage = `\n📊 Enable value estimates with /consent`;
    }

    await editOrReply(
      `✅ *Reading accepted!*\n` +
      `• Value: ${ocrResult.kwh} kWh\n` +
      `• Change: ${deltaText}\n` +
      `• Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
      `• Period: ${getCurrentPeriod()}\n` +
      valueMessage +
      `\n_⚠️ Estimates only. Official ZESCO credits handled separately._`,
      { parse_mode: 'Markdown' }
    );

    ctx.session.pendingReading = undefined;

  } catch (error) {
    logger.error({ error }, 'Processing error');
    await editOrReply('❌ Failed to save reading. Please try again.');
  }
}

// ====================== COMMANDS ======================
bot.start(async (ctx) => {
  const startPayload = (ctx as any).startPayload as string | undefined;
  const from = ctx.from;
  const telegramId = from.id.toString();

  const userId = await resolveUserId(telegramId, {
    username:   from.username,
    first_name: from.first_name,
    last_name:  from.last_name,
  });

  if (startPayload) {
    try {
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const parts = decoded.split('|');
      const clusterId = parts.find(p => p.startsWith('c:'))?.replace('c:', '');
      const unitId    = parts.find(p => p.startsWith('u:'))?.replace('u:', '');

      if (clusterId && unitId) {
        await supabase.from('users').upsert(
          { id: userId, default_cluster_id: clusterId },
          { onConflict: 'id' }
        );

        const phone = await getPhoneNumber(userId);

        await ctx.reply(
          `👋 *Welcome to Enerlectra!*\n\n` +
          `📍 Cluster: \`${clusterId}\`\n` +
          `🔌 Unit: \`${unitId}\`\n\n` +
          (phone
            ? `You're all set. Send a photo of your meter to log a reading.`
            : `One more step — register your MoMo number to receive payments:\n/register`),
          { parse_mode: 'Markdown' }
        );
        return;
      }
    } catch (e) {
      logger.error({ e }, 'Payload decode error');
    }
  }

  await ctx.reply(
    `👋 Hello! I'm *Ellie*, your Enerlectra assistant.\n\n` +
    `Commands:\n` +
    `📸 Send a meter photo to submit a reading\n` +
    `⚡ \`/read <kWh>\` — Submit manually\n` +
    `📱 \`/register\` — Add MoMo number\n` +
    `📊 \`/consent\` — Enable value estimates\n` +
    `🔍 \`/status\` — Your account info`,
    { parse_mode: 'Markdown' }
  );
});

// ── /register ──────────────────────────────────────────────────────────────
bot.command('register', async (ctx) => {
  ctx.session.awaitingPhone = true;
  await ctx.reply(
    `📱 *Register your MoMo number*\n\n` +
    `Reply with your Zambian number:\n` +
    `\`+260971234567\` or \`0971234567\``,
    { parse_mode: 'Markdown' }
  );
});

// ── /status ────────────────────────────────────────────────────────────────
bot.command('status', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);
  const phone = await getPhoneNumber(userId);

  let clusterInfo = 'Not linked';
  try {
    const { clusterId, unitId } = await getUserActiveCluster(userId);
    clusterInfo = `\`${clusterId}\` / Unit \`${unitId}\``;
  } catch { /* not linked */ }

  await ctx.reply(
    `*Your Enerlectra Status*\n\n` +
    `📍 Cluster: ${clusterInfo}\n` +
    `📱 MoMo: ${phone ?? '❌ Not registered — use /register'}\n\n` +
    `_Period: ${getCurrentPeriod()}_`,
    { parse_mode: 'Markdown' }
  );
});

// ── /consent ───────────────────────────────────────────────────────────────
bot.command('consent', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);

  await supabase.from('users').upsert(
    { id: userId, consent_given: true, consent_given_at: new Date().toISOString() },
    { onConflict: 'id' }
  );

  await ctx.reply(
    '✅ Consent recorded. You will now see estimated ZMW values.\n\nRevoke with /revoke_consent'
  );
});

bot.command('revoke_consent', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);

  await supabase.from('users').upsert(
    { id: userId, consent_given: false, consent_given_at: null },
    { onConflict: 'id' }
  );

  await ctx.reply('❌ Consent revoked.');
});

// ── /read ──────────────────────────────────────────────────────────────────
bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const readingKwh = parseFloat(parts[1]);

  if (isNaN(readingKwh) || readingKwh <= 0) {
    return ctx.reply('❌ Usage: `/read <kWh>`  e.g. `/read 8430.6`', { parse_mode: 'Markdown' });
  }

  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);
  const requestId = crypto.randomUUID();

  try {
    const { clusterId, unitId } = await getUserActiveCluster(userId);

    const validation = await validateReading({
      userId,
      clusterId,
      newKwh:     readingKwh,
      confidence: 1.0,
      meterType:  'unknown',
      requestId,
      logger,
    });

    if (!validation.valid) {
      return ctx.reply(`⚠️ Reading rejected: ${validation.reason}`);
    }

    await supabase.from('meter_readings').insert({
      user_id:          userId,
      cluster_id:       clusterId,
      unit_id:          unitId,
      reading_kwh:      readingKwh,
      meter_type:       'unknown',
      validated:        true,
      reporting_period: getCurrentPeriod(),
      source:           'telegram_manual',
    });

    await ctx.reply(`✅ Manual reading recorded: *${readingKwh} kWh*`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    logger.error({ err }, 'Manual reading failed');
    ctx.reply('❌ Failed to submit reading. ' + err.message);
  }
});

// ====================== TEXT HANDLER (phone registration) ======================
// Must be before the photo handler. Intercepts plain text when awaitingPhone is set.
bot.on(message('text'), async (ctx, next) => {
  if (!ctx.session.awaitingPhone) return next();

  const normalized = normalizeZambianPhone(ctx.message.text);

  if (!normalized) {
    await ctx.reply(
      '❌ Invalid number. Please enter a valid Zambian number:\n`+260971234567` or `0971234567`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId);

  const { error } = await supabase
    .from('telegram_users')
    .update({ phone_number: normalized, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);

  if (error) {
    logger.error({ err: error }, 'Failed to save phone number');
    await ctx.reply('❌ Failed to save number. Please try again.');
    return;
  }

  ctx.session.awaitingPhone = false;

  await ctx.reply(
    `✅ *MoMo number registered:* ${normalized}\n\n` +
    `You'll receive energy credit payments to this number.\n\n` +
    `Send a photo of your meter to log a reading.`,
    { parse_mode: 'Markdown' }
  );
});

// ====================== PHOTO HANDLER ======================
bot.on(message('photo'), async (ctx) => {
  const photo = ctx.message.photo.slice(-1)[0];
  const from = ctx.from;
  const telegramId = from.id.toString();

  const userId = await resolveUserId(telegramId, {
    username:   from.username,
    first_name: from.first_name,
    last_name:  from.last_name,
  });

  const requestId = crypto.randomUUID();

  const rateCheck = await rateLimiter.check(telegramId);
  if (!rateCheck.allowed) {
    await ctx.reply(`⏳ Rate limit reached. Try again in ${rateCheck.retryAfterSeconds}s.`);
    return;
  }

  const statusMsg = await ctx.reply('⏳ Reading your meter...');

  try {
    const file = await ctx.telegram.getFile(photo.file_id);
    const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const ocrResult = await readMeterOCR(imageUrl, { requestId });

    if (ocrResult.status === 'failed' || ocrResult.kwh === null) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `❌ Could not read the meter.\n\n` +
        `${ocrResult.error || 'No numbers detected'}\n\n` +
        `Try: /read <value>`
      );
      return;
    }

    // Low confidence — ask user to confirm before saving
    if (ocrResult.confidence < 0.80) {
      ctx.session.pendingReading = {
        imageUrl,
        ocrResult,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min window
      };

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `📸 *Reading detected:* ${ocrResult.kwh} kWh\n` +
        `Type: ${ocrResult.meterType.replace(/_/g, ' ')}\n` +
        `Confidence: ${(ocrResult.confidence * 100).toFixed(0)}%\n\n` +
        `Is this correct?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, save it', callback_data: 'confirm:yes' }],
              [{ text: '❌ No, cancel',  callback_data: 'confirm:no'  }],
              [{ text: '✏️ Enter manually', callback_data: 'confirm:manual' }],
            ],
          },
        }
      );
      return;
    }

    // High confidence — save immediately
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
  const data = (ctx.callbackQuery as any).data as string | undefined;
  if (!data?.startsWith('confirm:')) return;

  await ctx.answerCbQuery();
  const action = data.split(':')[1];

  const pending = ctx.session.pendingReading;
  if (!pending || Date.now() > pending.expiresAt) {
    await ctx.editMessageText('⏰ Session expired. Please send the photo again.');
    return;
  }

  const telegramId = ctx.from!.id.toString();
  const userId = await resolveUserId(telegramId);
  const requestId = crypto.randomUUID();

  if (action === 'yes') {
    await processAndSaveReading(
      ctx,
      userId,
      pending.ocrResult,
      pending.imageUrl,
      requestId,
      (ctx.callbackQuery as any).message?.message_id
    );
  } else if (action === 'no') {
    ctx.session.pendingReading = undefined;
    await ctx.editMessageText('❌ Reading cancelled. Send a new photo when ready.');
  } else if (action === 'manual') {
    ctx.session.pendingReading = undefined;
    await ctx.editMessageText('Enter the reading manually:\n`/read <value>`', { parse_mode: 'Markdown' });
  }
});

// ====================== ERROR HANDLER ======================
bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, 'Bot error');
  ctx.reply('❌ An unexpected error occurred. Our team has been notified.');
});

// ====================== GRACEFUL SHUTDOWN ======================
process.once('SIGINT',  () => { logger.info('SIGINT received'); bot.stop('SIGINT');  });
process.once('SIGTERM', () => { logger.info('SIGTERM received'); bot.stop('SIGTERM'); });

// ====================== LAUNCH ======================
bot.launch()
  .then(() => logger.info('🤖 Ellie is online!'))
  .catch(err => logger.error({ err }, 'Bot launch failed'));