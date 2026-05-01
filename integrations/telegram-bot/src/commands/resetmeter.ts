// integrations/telegram-bot/src/commands/resetmeter.ts
import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import crypto from 'node:crypto';
import { redis, REDIS_KEY_PREFIX, PENDING_TTL_SECONDS } from '../lib/redis';
import { supabase } from '../lib/supabase';
import type { MeterType } from '../services/ocr';
import type { Logger } from 'pino';

const RESET_SESSION_PREFIX = `${REDIS_KEY_PREFIX}:reset`;
const METER_TYPE_LABELS: Record<MeterType, string> = {
  grid_import: 'Grid Import',
  solar_import: 'Solar Import',
  solar_export: 'Solar Export',
  solar_generation: 'Solar Generation',
  generator: 'Generator',
  unit_submeter: 'Unit Submeter',
  unknown: 'Unknown',
};

const ALLOWED_METER_TYPES: MeterType[] = [
  'grid_import',
  'solar_import',
  'solar_export',
  'solar_generation',
  'generator',
  'unit_submeter',
];

interface ResetSession {
  step: 'awaiting_meter_type' | 'awaiting_confirmation';
  selectedMeterType?: MeterType;
  clusterId?: string;
}

function resetKey(userId: string): string {
  return `${RESET_SESSION_PREFIX}:${userId}`;
}

async function getResetSession(userId: string): Promise<ResetSession | null> {
  const data = await redis.get<string | object>(resetKey(userId));
  if (!data) return null;

  if (typeof data === 'string') {
    return JSON.parse(data) as ResetSession;
  }

  return data as ResetSession;
}

async function setResetSession(userId: string, session: ResetSession): Promise<void> {
  await redis.set(resetKey(userId), JSON.stringify(session), { ex: PENDING_TTL_SECONDS });
}

async function clearResetSession(userId: string): Promise<void> {
  await redis.del(resetKey(userId));
}

function createSafeLogger(base: Logger | undefined, context: Record<string, unknown>) {
  if (base && typeof base.child === 'function') return base.child(context);
  const prefix = Object.entries(context).map(([k, v]) => `${k}=${v}`).join(' ');
  return {
    info: (obj: unknown, msg?: string) => console.log(`[INFO] ${prefix} ${msg ?? ''}`, obj),
    warn: (obj: unknown, msg?: string) => console.warn(`[WARN] ${prefix} ${msg ?? ''}`, obj),
    error: (obj: unknown, msg?: string) => console.error(`[ERROR] ${prefix} ${msg ?? ''}`, obj),
  };
}

export async function resetmeterCommand(ctx: Context, userId: string, logger?: Logger) {
  const log = createSafeLogger(logger, { command: '/resetmeter', userId });

  const { data: memberships, error: membershipError } = await supabase
    .from('cluster_members')
    .select('cluster_id, clusters:cluster_id(name)')
    .eq('user_id', userId)
    .limit(1);

  if (membershipError || !memberships || memberships.length === 0) {
    await ctx.reply('You are not associated with any cluster. Please join a community first via /clusters.');
    return;
  }

  const clusterId = memberships[0].cluster_id;
  await setResetSession(userId, { step: 'awaiting_meter_type', clusterId });

  const buttons = ALLOWED_METER_TYPES.map((mt) => [
    Markup.button.callback(METER_TYPE_LABELS[mt], `resetmeter_type_${mt}`),
  ]);

  log.info({ clusterId }, 'Reset flow started');

  await ctx.reply(
    `*Reset Meter Baseline*\\n\\n` +
    `This will mark the next reading as a *new baseline* for the selected meter. ` +
    `Use this when:\\n` +
    `• A meter has been replaced\\n` +
    `• A meter was reset to zero\\n` +
    `• You are switching to a different physical meter\\n\\n` +
    `Select the meter type to reset:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    }
  );
}

export async function resetmeterTypeCallback(ctx: Context, userId: string, meterType: MeterType, logger?: Logger) {
  const log = createSafeLogger(logger, { callback: 'resetmeter_type', userId, meterType });
  const session = await getResetSession(userId);

  if (!session || session.step !== 'awaiting_meter_type') {
    await ctx.answerCbQuery('Session expired. Please run /resetmeter again.');
    return;
  }

  session.selectedMeterType = meterType;
  session.step = 'awaiting_confirmation';
  await setResetSession(userId, session);

  log.info({ clusterId: session.clusterId }, 'Meter type selected');

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `*Confirm Reset*\\n\\n` +
    `Meter type: *${METER_TYPE_LABELS[meterType]}*\\n\\n` +
    `This will:\\n` +
    `1. Mark the *next submitted reading* as the new baseline\\n` +
    `2. Ignore the previous reading history for delta calculations\\n\\n` +
    `Are you sure?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Yes, reset baseline', 'resetmeter_confirm_yes')],
        [Markup.button.callback('Cancel', 'resetmeter_confirm_no')],
      ]),
    }
  );
}

export async function resetmeterConfirmCallback(ctx: Context, userId: string, confirmed: boolean, logger?: Logger) {
  const log = createSafeLogger(logger, { callback: 'resetmeter_confirm', userId, confirmed });
  const session = await getResetSession(userId);

  if (!session || session.step !== 'awaiting_confirmation') {
    await ctx.answerCbQuery('Session expired. Please run /resetmeter again.');
    return;
  }

  if (!confirmed) {
    await clearResetSession(userId);
    await ctx.answerCbQuery('Cancelled');
    await ctx.editMessageText('Reset cancelled. No changes were made.');
    return;
  }

  const clusterId = session.clusterId!;
  const meterType = session.selectedMeterType!;
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { error: insertError } = await supabase.from('meter_readings').insert({
    user_id: userId,
    cluster_id: clusterId,
    meter_type: meterType,
    reading_kwh: -1,
    photo_url: null,
    ocr_confidence: 1.0,
    validated: true,
    captured_at: now.toISOString(),
    reporting_period: period,
    source: 'user_reset',
    delta_kwh: 0,
    reading_key: crypto.randomUUID(),
    status: 'reset_marker',
    metadata: {},
  });

  if (insertError) {
    log.error({ error: insertError }, 'Reset marker insert failed');
    await ctx.answerCbQuery('Error');
    await ctx.editMessageText('Failed to record reset marker. Please try again or contact support.');
    return;
  }

  await clearResetSession(userId);
  log.info({ clusterId, meterType }, 'Baseline reset recorded');

  await ctx.answerCbQuery('Baseline reset');
  await ctx.editMessageText(
    `*Baseline reset recorded*\\n\\n` +
    `Meter: *${METER_TYPE_LABELS[meterType]}*\\n\\n` +
    `The *next reading* you submit for this meter will be treated as a new baseline. ` +
    `Delta calculations will start from that reading.`,
    { parse_mode: 'Markdown' }
  );
}