// enerlectra-core/src/core/handlers/resetmeter.handler.ts

import crypto from 'node:crypto';
import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { redis, REDIS_KEY_PREFIX, PENDING_TTL_SECONDS } from '../../../../infrastructure/redis.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import type { Logger } from 'pino';
import {
  ALLOWED_METER_TYPES,
  METER_TYPE_LABELS,
  type ResetSession,
  type ResetmeterStartResult,
  type ResetmeterSelectResult,
  type ResetmeterConfirmResult,
} from './resetmeter.types.js';

const RESET_SESSION_PREFIX = `${REDIS_KEY_PREFIX}:reset`;

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
  const prefix = Object.entries(context)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return {
    info: (obj: unknown, msg?: string) => console.log(`[INFO] ${prefix} ${msg ?? ''}`, obj),
    warn: (obj: unknown, msg?: string) => console.warn(`[WARN] ${prefix} ${msg ?? ''}`, obj),
    error: (obj: unknown, msg?: string) => console.error(`[ERROR] ${prefix} ${msg ?? ''}`, obj),
  };
}

export interface ResetmeterStartPayload {
  logger?: Logger;
}

export interface ResetmeterSelectPayload {
  meterType: string;
  logger?: Logger;
}

export interface ResetmeterConfirmPayload {
  confirmed: boolean;
  logger?: Logger;
}

/**
 * START_RESET_METER
 *
 * Previously: resetmeterCommand(ctx, userId, logger?)
 */
export class StartResetMeterHandler implements CommandHandler {
  async execute(command: Command): Promise<ResetmeterStartResult> {
    const userId = command.context.actorId;
    const payload = command.payload as ResetmeterStartPayload | any;
    const log = createSafeLogger(payload.logger, { command: '/resetmeter', userId });

    const { data: memberships, error: membershipError } = await supabase
      .from('cluster_members')
      .select('cluster_id, clusters:cluster_id(name)')
      .eq('user_id', userId)
      .limit(1);

    if (membershipError || !memberships || memberships.length === 0) {
      return {
        session: { step: 'awaiting_meter_type' },
        message:
          'You are not associated with any cluster. Please join a community first via /clusters.',
        meterTypeOptions: [],
      };
    }

    const clusterId = memberships[0].cluster_id;
    const session: ResetSession = { step: 'awaiting_meter_type', clusterId };

    await setResetSession(userId, session);

    const meterTypeOptions = ALLOWED_METER_TYPES.map(mt => ({
      type: mt,
      label: METER_TYPE_LABELS[mt],
    }));

    log.info({ clusterId }, 'Reset flow started');

    const message =
      `*Reset Meter Baseline*\n\n` +
      `This will mark the next reading as a *new baseline* for the selected meter. ` +
      `Use this when:\n` +
      `• A meter has been replaced\n` +
      `• A meter was reset to zero\n` +
      `• You are switching to a different physical meter\n\n` +
      `Select the meter type to reset:`;

    return {
      session,
      clusterId,
      message,
      meterTypeOptions,
    };
  }
}

/**
 * SELECT_RESET_METER_TYPE
 *
 * Previously: resetmeterTypeCallback(ctx, userId, meterType, logger?)
 */
export class SelectResetMeterTypeHandler implements CommandHandler {
  async execute(command: Command): Promise<ResetmeterSelectResult> {
    const userId = command.context.actorId;
    const payload = command.payload as ResetmeterSelectPayload | any;
    const meterType = payload.meterType as string;
    const log = createSafeLogger(payload.logger, {
      callback: 'resetmeter_type',
      userId,
      meterType,
    });

    const session = await getResetSession(userId);

    if (!session || session.step !== 'awaiting_meter_type') {
      return {
        session: { step: 'awaiting_meter_type', clusterId: session?.clusterId },
        meterType: meterType as any,
        message: 'Session expired. Please run /resetmeter again.',
      };
    }

    session.selectedMeterType = meterType as any;
    session.step = 'awaiting_confirmation';
    await setResetSession(userId, session);

    log.info({ clusterId: session.clusterId }, 'Meter type selected');

    const message =
      `*Confirm Reset*\n\n` +
      `Meter type: *${METER_TYPE_LABELS[meterType as keyof typeof METER_TYPE_LABELS]}*\n\n` +
      `This will:\n` +
      `1. Mark the *next submitted reading* as the new baseline\n` +
      `2. Ignore the previous reading history for delta calculations\n\n` +
      `Are you sure?`;

    return {
      session,
      meterType: meterType as any,
      message,
    };
  }
}

/**
 * CONFIRM_RESET_METER
 *
 * Previously: resetmeterConfirmCallback(ctx, userId, confirmed, logger?)
 */
export class ConfirmResetMeterHandler implements CommandHandler {
  async execute(command: Command): Promise<ResetmeterConfirmResult> {
    const userId = command.context.actorId;
    const payload = command.payload as ResetmeterConfirmPayload | any;
    const confirmed = Boolean(payload.confirmed);
    const log = createSafeLogger(payload.logger, {
      callback: 'resetmeter_confirm',
      userId,
      confirmed,
    });

    const session = await getResetSession(userId);

    if (!session || session.step !== 'awaiting_confirmation') {
      return {
        status: 'SESSION_EXPIRED',
        sessionCleared: false,
        message: 'Session expired. Please run /resetmeter again.',
      };
    }

    if (!confirmed) {
      await clearResetSession(userId);
      log.info({}, 'Reset cancelled');
      return {
        status: 'CANCELLED',
        sessionCleared: true,
        message: 'Reset cancelled. No changes were made.',
      };
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
      return {
        status: 'FAILED',
        sessionCleared: false,
        message: 'Failed to record reset marker. Please try again or contact support.',
      };
    }

    await clearResetSession(userId);
    log.info({ clusterId, meterType }, 'Baseline reset recorded');

    const message =
      `*Baseline reset recorded*\n\n` +
      `Meter: *${METER_TYPE_LABELS[meterType]}*\n\n` +
      `The *next reading* you submit for this meter will be treated as a new baseline. ` +
      `Delta calculations will start from that reading.`;

    return {
      status: 'RECORDED',
      sessionCleared: true,
      message,
      clusterId,
      meterType,
    };
  }
}