// integrations/telegram-bot/src/bot.ts
// Production Ellie bot — all imports local, no cross-package paths.

import dotenv from 'dotenv';
dotenv.config();

import { Telegraf, Context, session } from 'telegraf';
import { message } from 'telegraf/filters';
import express from 'express';
import { supabase } from './lib/supabase'; // ✅ use shared client
import pino from 'pino';
import crypto from 'node:crypto';

import { readMeterOCR, MeterOcrResult, MeterType, setLogger as setOcrLogger } from './services/ocr';
import { validateReading } from './services/validation';
import { calculateValue } from './services/tariff-calculator';
import { OCRRateLimiter } from './services/rate-limiter';
import { requestLencoPayout, createPendingRedemption } from './services/settlement';
import { mintPCUForExportReading } from './services/pcuMinting';
import { transferPCU } from './services/pcuTransfer';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
setOcrLogger(logger);

// --- removed: const supabase: SupabaseClient = createClient(...) ---

const rateLimiter = new OCRRateLimiter(logger);

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Ellie is awake and monitoring the grid.'));
app.listen(PORT, () => logger.info(`Health check listening on port ${PORT}`));

interface BotSession {
  clusterId?: string;
  pendingReading?: {
    imageUrl: string;
    ocrResult: MeterOcrResult;
    expiresAt: number;
  };
  awaitingPhone?: boolean;
  pendingRedemption?: {
    userId: string;
    phone: string;
    amountPcu: number;
    clusterId: string;
    reference: string;
    expiresAt: number;
  };
}

interface BotContext extends Context {
  session: BotSession;
}

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);
bot.use(session({ defaultSession: (): BotSession => ({}) }));

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizePhoneNumber(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '');
  let n = cleaned;
  if (n.startsWith('0')) n = '+260' + n.slice(1);
  if (n.startsWith('260')) n = '+' + n;
  return /^\+260\d{9}$/.test(n) ? n : null;
}

async function getLiveExchangeRate(): Promise<number> {
  const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
  if (!API_KEY) throw new Error('EXCHANGE_RATE_API_KEY not configured');
  const axios = (await import('axios')).default;
  const res = await axios.get(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`);
  const rate = res.data?.conversion_rates?.ZMW;
  if (!rate) throw new Error('Invalid exchange rate response');
  return rate;
}

async function resolveUserId(
  telegramId: string,
  profile?: { username?: string; first_name?: string; last_name?: string }
): Promise<string> {
  const { data, error } = await supabase
    .from('telegram_users')
    .upsert({
      telegram_id: telegramId,
      username: profile?.username ?? null,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'telegram_id' })
    .select('user_id')
    .single();

  if (error) throw new Error('Unable to set up your account');
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

// ====================== CLUSTER RESOLUTION (NO AUTO-ENROLL) ======================
async function resolveCluster(
  ctx: BotContext,
  userId: string
): Promise<{ clusterId: string | null; unitId: string }> {
  if (ctx.session.clusterId) return { clusterId: ctx.session.clusterId, unitId: 'A1' };

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

  // No membership – return null so callers can prompt the user
  return { clusterId: null, unitId: 'A1' };
}

// ====================== PROMPT USER TO PICK A CLUSTER ======================
async function promptForCluster(ctx: BotContext) {
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, name, location')
    .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED']) // ✅ FIXED: use lifecycle_state
    .limit(10);

  if (!clusters?.length) {
    await ctx.reply('No communities available yet. Please check back later or contact support.');
    return;
  }

  const keyboard = clusters.map(c => [{
    text: `${c.name}${c.location ? ` – ${c.location}` : ''}`,
    callback_data: `join:${c.id}`,
  }]);

  await ctx.reply(
    'You haven\'t joined a community yet. Select one below:',
    { reply_markup: { inline_keyboard: keyboard } }
  );
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
      return ctx.telegram.editMessageText(ctx.chat!.id, editMessageId, undefined, text, extra)
        .catch(() => ctx.reply(text, extra));
    }
    return ctx.reply(text, extra);
  };

  // ---- resolve cluster – prompt if missing ----
  const { clusterId, unitId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await editOrReply('Please join a community first. Use /clusters to browse.');
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
      requestId,
      logger,
    });

    if (!validation.valid) {
      await editOrReply(`Reading rejected: ${validation.reason}`);
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
        captured_at: new Date().toISOString(),
        reporting_period: getCurrentPeriod(),
        source: 'telegram',
      })
      .select('*')
      .single();

    if (insertError) throw insertError;

    const isExport = reading.meter_type === 'solar_export' || reading.meter_type === 'solar_generation';
    if (isExport) {
      await mintPCUForExportReading(reading).catch(err =>
        logger.error({ err }, 'PCU minting failed — reading saved')
      );
    }

    const deltaText = validation.delta !== null
      ? `${validation.delta > 0 ? '+' : ''}${validation.delta.toFixed(2)} kWh`
      : 'First reading';

    let valueMessage = '';
    const phone = await getPhoneNumber(userId);

    if (phone && validation.delta && validation.delta > 0) {
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

        if (value.netValue >= 1) {
          try {
            const payout = await requestLencoPayout({
              userId,
              clusterId,
              readingId: reading.id,
              amount: value.netValue,
              phoneNumber: phone,
              narration: `Enerlectra credit – ${validation.delta.toFixed(2)} kWh`,
            }, logger);

            valueMessage +=
              `\n*Payout initiated*\n` +
              `Ref: \`${payout.reference}\`\n` +
              `Status: ${payout.status}\n` +
              `To: ${phone}\n`;
          } catch (err) {
            logger.error({ err }, 'Auto-payout failed');
            valueMessage += `\nPayout failed – reading saved. Support will follow up.`;
          }
        } else {
          valueMessage += `\nPayout below K1 deferred.`;
        }
      } catch (err) {
        logger.error({ err }, 'Value calculation failed');
        valueMessage = `\nValue estimation unavailable.`;
      }
    } else if (!phone && validation.delta && validation.delta > 0) {
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
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId, {
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
  });

  if (startPayload) {
    try {
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const clusterId = decoded.split('|').find(p => p.startsWith('c:'))?.replace('c:', '');
      if (clusterId) {
        ctx.session.clusterId = clusterId;
        await supabase.from('cluster_members').upsert(
          { cluster_id: clusterId, user_id: userId },
          { onConflict: 'cluster_id,user_id' }
        );
        return ctx.reply(
          `*Welcome to Enerlectra!*\n\nCommunity: \`${clusterId}\`\n\nSend a meter photo to log a reading.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch {}
  }

  // Do NOT auto-enroll; the user can pick later
  const phone = await getPhoneNumber(userId);

  await ctx.reply(
    `Hello! I'm *Ellie*, your Enerlectra assistant.\n\n` +
    (phone ? '' : `Register your mobile number: /register\n\n`) +
    `Commands:\n` +
    `Send a meter photo – Submit a reading\n` +
    `/read <kWh> [type] – Manual entry\n` +
    `/balance – Check your PCU balance\n` +
    `/status – View your linked cluster\n` +
    `/register – Add mobile money number\n` +
    `/history – View past submissions\n` +
    `/redeem <amount> – Cash out PCU\n` +
    `/transfer <amount> <@user> – Send PCU\n` +
    `/clusters – Browse communities`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `*Ellie Commands*\n\n` +
    `Send a meter photo – Submit a reading\n` +
    `/read <kWh> [type] – e.g. /read 150 solar_export\n` +
    `/balance – Check your PCU balance\n` +
    `/status – View your linked cluster\n` +
    `/register – Add mobile number\n` +
    `/history – View past submissions\n` +
    `/redeem <amount> – Cash out PCU\n` +
    `/transfer <amount> <@user> – Send PCU\n` +
    `/clusters – Browse communities`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('balance', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const { data } = await supabase
    .from('pcu_balances')
    .select('balance_pcu, total_minted_pcu')
    .eq('user_id', userId)
    .single();

  if (!data) return ctx.reply('No PCU wallet found. Submit an export reading first.');
  await ctx.reply(
    `*Your PCU Balance*\n\nAvailable: ${data.balance_pcu} PCU\nLifetime earned: ${data.total_minted_pcu} PCU`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('status', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const phone = await getPhoneNumber(userId);
  const { clusterId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await ctx.reply('You are not part of a community yet. Use /clusters to join one.');
    return;
  }
  await ctx.reply(
    `*Your Status*\n\nCommunity: \`${clusterId}\`\nMobile: ${phone ?? 'Not registered – /register'}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('register', async (ctx) => {
  ctx.session.awaitingPhone = true;
  await ctx.reply('Reply with your mobile number:\n`+260XXXXXXXXX` or `097XXXXXXX`', { parse_mode: 'Markdown' });
});

// ✅ FIXED: use lifecycle_state
bot.command('clusters', async (ctx) => {
  const { data: clusters } = await supabase
    .from('clusters')
    .select('id, name, location')
    .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
    .limit(10);

  if (!clusters?.length) return ctx.reply('No communities available. Contact your administrator.');

  const keyboard = clusters.map(c => [{
    text: `${c.name}${c.location ? ` – ${c.location}` : ''}`,
    callback_data: `join:${c.id}`,
  }]);

  await ctx.reply(
    `*Available Energy Communities*\n\nSelect one to join:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
  );
});

bot.action(/^join:(.+)/, async (ctx) => {
  const clusterId = ctx.match[1];
  const userId = await resolveUserId(ctx.from.id.toString());

  await supabase.from('cluster_members').upsert(
    { cluster_id: clusterId, user_id: userId },
    { onConflict: 'cluster_id,user_id' }
  );
  ctx.session.clusterId = clusterId;

  const { data: cluster } = await supabase.from('clusters').select('name').eq('id', clusterId).single();
  const phone = await getPhoneNumber(userId);

  await ctx.editMessageText(
    `*Joined ${cluster?.name ?? clusterId}*\n\n` +
    (phone ? `Send a meter photo to log a reading.` : `Register your mobile number:\n/register`),
    { parse_mode: 'Markdown' }
  );
});

// ---- FIXED: plain text, no Markdown parsing ----
bot.command('history', async (ctx) => {
  const userId = await resolveUserId(ctx.from.id.toString());
  const { data: readings } = await supabase
    .from('meter_readings')
    .select('reading_kwh, meter_type, captured_at')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(5);

  if (!readings?.length) return ctx.reply('No readings yet.');
  let msg = `Recent Submissions\n\n`;
  for (const r of readings) {
    const date = new Date(r.captured_at).toLocaleDateString('en-GB');
    msg += `• ${r.reading_kwh} kWh (${r.meter_type}) – ${date}\n`;
  }
  await ctx.reply(msg);
});

bot.command('redeem', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const amount = parseFloat(parts[1]);
  if (isNaN(amount) || amount <= 0) return ctx.reply('Usage: /redeem <amount>  e.g. /redeem 5');

  const userId = await resolveUserId(ctx.from.id.toString());
  const phone = await getPhoneNumber(userId);
  if (!phone) return ctx.reply('Register your mobile number first: /register');

  const { clusterId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await ctx.reply('Please join a community first. Use /clusters to browse.');
    await promptForCluster(ctx);
    return;
  }

  const reference = crypto.randomUUID();

  ctx.session.pendingRedemption = {
    userId,
    phone,
    amountPcu: amount,
    clusterId,
    reference,
    expiresAt: Date.now() + 60_000,
  };

  await createPendingRedemption({
    userId,
    clusterId,
    amountPcu: amount,
    phone,
    reference,
    idempotencyKey: reference,
  }, logger);

  await ctx.reply(`Confirm redemption of ${amount} PCU to ${phone}.\n\nReply YES to confirm.`);
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

bot.command('read', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  const kwh = parseFloat(parts[1]);
  const meterType: MeterType = (parts[2] as MeterType) || 'unknown';
  if (isNaN(kwh) || kwh <= 0) return ctx.reply('Usage: /read <kWh> [type]  e.g. /read 152.61');

  const userId = await resolveUserId(ctx.from.id.toString());
  const { clusterId, unitId } = await resolveCluster(ctx, userId);
  if (!clusterId) {
    await ctx.reply('Please join a community first. Use /clusters to browse.');
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
  if (!validation.valid) return ctx.reply(`Rejected: ${validation.reason}`);

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
      reporting_period: getCurrentPeriod(),
      source: 'telegram_manual',
    })
    .select('*')
    .single();

  if (error) return ctx.reply('Failed to save reading.');

  const isExport = reading.meter_type === 'solar_export' || reading.meter_type === 'solar_generation';
  if (isExport) {
    await mintPCUForExportReading(reading).catch(err => logger.error({ err }, 'Mint failed'));
    await ctx.reply(`Export recorded: ${kwh} kWh. PCU minted. Check /balance.`);
  } else {
    await ctx.reply(`Reading recorded: ${kwh} kWh.`);
  }
});

// Photo handler unchanged (already had cluster resolution)

bot.on(message('photo'), async (ctx) => {
  const photo = ctx.message.photo.slice(-1)[0];
  const telegramId = ctx.from.id.toString();
  const userId = await resolveUserId(telegramId, {
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
  });
  const requestId = crypto.randomUUID();

  const rateCheck = await rateLimiter.check(telegramId);
  if (!rateCheck.allowed) {
    return ctx.reply(`Rate limit reached. Try again in ${rateCheck.retryAfterSeconds}s.`);
  }

  const statusMsg = await ctx.reply('Reading your meter...');

  try {
    const file = await ctx.telegram.getFile(photo.file_id);
    const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const ocrResult = await readMeterOCR(imageUrl, { requestId });

    if (ocrResult.status === 'manual_required') {
      return await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `Photo received, but automatic reading is temporarily unavailable.\n\nPlease enter manually:\n/read <value>  e.g. /read 152.61`,
        { parse_mode: 'Markdown' }
      );
    }

    if (ocrResult.status === 'failed' || !ocrResult.kwh) {
      return await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `Could not read the meter.\n\n${ocrResult.error || 'No numbers detected'}\n\n` +
          `Tips:\n– Hold phone steady, parallel to meter\n– Ensure display is lit\n– Avoid glare\n\nOr enter manually: /read <value>`,
        { parse_mode: 'Markdown' }
      );
    }

    if (ocrResult.status === 'review' || ocrResult.confidence < 0.80) {
      ctx.session.pendingReading = {
        imageUrl,
        ocrResult,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };

      const sourceNote = ocrResult.source === 'claude_vision'
        ? '\n_AI vision reading – please verify carefully._'
        : '';

      return await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
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
    }

    await processAndSaveReading(ctx, userId, ocrResult, imageUrl, requestId, statusMsg.message_id);
  } catch (err) {
    logger.error({ err, userId }, 'Photo handler error');
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      'An unexpected error occurred. Please try again.'
    ).catch(() => ctx.reply('An unexpected error occurred.'));
  }
});

bot.on('callback_query', async (ctx) => {
  const data = (ctx.callbackQuery as any).data as string | undefined;
  if (!data?.startsWith('confirm:')) return;

  await ctx.answerCbQuery();
  const action = data.split(':')[1];
  const pending = ctx.session.pendingReading;

  if (!pending || Date.now() > pending.expiresAt) {
    return ctx.editMessageText('Session expired. Please send the photo again.');
  }

  const userId = await resolveUserId(ctx.from!.id.toString());

  if (action === 'yes') {
    await processAndSaveReading(
      ctx,
      userId,
      pending.ocrResult,
      pending.imageUrl,
      crypto.randomUUID(),
      ctx.callbackQuery.message?.message_id
    );
  } else if (action === 'no') {
    ctx.session.pendingReading = undefined;
    await ctx.editMessageText('Reading cancelled. Send a new photo when ready.');
  } else if (action === 'manual') {
    ctx.session.pendingReading = undefined;
    await ctx.editMessageText('Enter the reading manually:\n`/read <value>`', { parse_mode: 'Markdown' });
  }
});

bot.on(message('text'), async (ctx, next) => {
  if (ctx.session.awaitingPhone) {
    const normalized = normalizePhoneNumber(ctx.message.text);
    if (!normalized) {
      return ctx.reply('Invalid number. Try +260XXXXXXXXX or 097XXXXXXX.');
    }
    const { error } = await supabase
      .from('telegram_users')
      .update({ phone_number: normalized, updated_at: new Date().toISOString() })
      .eq('telegram_id', ctx.from.id.toString());

    if (error) return ctx.reply('Failed to save number. Please try again.');
    ctx.session.awaitingPhone = false;
    return ctx.reply(`Mobile number registered: ${normalized}\n\nSend a meter photo to log a reading.`);
  }

  const pending = ctx.session.pendingRedemption;
  if (pending && Date.now() < pending.expiresAt && ctx.message.text.trim().toUpperCase() === 'YES') {
    ctx.session.pendingRedemption = undefined;

    try {
      const fxRate = await getLiveExchangeRate();
      const amountZmw = pending.amountPcu * fxRate;

      const payout = await requestLencoPayout({
        userId: pending.userId,
        clusterId: pending.clusterId,
        amount: amountZmw,
        phoneNumber: pending.phone,
        narration: `PCU Redemption – ${pending.amountPcu} PCU`,
        reference: pending.reference,
        idempotencyKey: pending.reference,
      }, logger);

      await ctx.reply(
        `*Payout initiated!*\n\nRef: \`${payout.reference}\`\nAmount: K${amountZmw.toFixed(2)}\nTo: ${pending.phone}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err: any) {
      logger.error({ err }, 'Redemption failed');
      return ctx.reply(`Redemption failed: ${err.message}`);
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

bot.launch()
  .then(() => logger.info('Ellie is online!'))
  .catch(err => logger.error({ err }, 'Bot launch failed'));