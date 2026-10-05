// integrations/telegram-bot/src/services/validation.ts
import { supabase } from '../../infrastructure/supabase.js';
import type { MeterType } from './ocr.js';
import type { Logger } from 'pino';

// ─── Fraud Scoring (inline) ──────────────────────────────────────────
const FRAUD_SIGNALS_TABLE = 'fraud_signals';
const FRAUD_ALERTS_TABLE = 'fraud_alerts';
const FRAUD_WINDOW_HOURS = 24;
const FRAUD_ALERT_THRESHOLD = 1.0;

async function recordFraudSignal(
  userId: string,
  clusterId: string,
  signalType: 'delta_spike' | 'rapid_submission' | 'visual_mismatch',
  severity: number,
  metadata: Record<string, unknown>,
  log: ReturnType<typeof createSafeLogger>
): Promise<void> {
  try {
    const { error } = await supabase.from(FRAUD_SIGNALS_TABLE).insert({
      user_id: userId,
      cluster_id: clusterId,
      signal_type: signalType,
      severity: Math.min(1, Math.max(0, severity)),
      metadata,
      created_at: new Date().toISOString(),
    });

    if (error) {
      log.warn({ error }, 'Failed to write fraud signal');
      return;
    }

    const windowStart = new Date(Date.now() - FRAUD_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from(FRAUD_SIGNALS_TABLE)
      .select('severity')
      .eq('user_id', userId)
      .gte('created_at', windowStart);

    const score = (recent || []).reduce((s, r) => s + (r.severity ?? 0), 0);

    if (score >= FRAUD_ALERT_THRESHOLD) {
      await supabase.from(FRAUD_ALERTS_TABLE).insert({
        user_id: userId,
        cluster_id: clusterId,
        cumulative_score: score,
        status: 'open',
        created_at: new Date().toISOString(),
      });
      log.warn({ score, userId }, 'Fraud alert threshold breached');
    }
  } catch (err) {
    log.warn({ err }, 'Fraud scoring failed silently');
  }
}


interface MeterTypeRules {
  allowedDecreaseKwh: number;
  maxIncreaseKwhPerHour: number;
  absoluteMaxIncreaseKwh: number;
  strictMonotonic: boolean;
  allowsRollover: boolean;
  rolloverThreshold?: number;
  rolloverDetectionFraction?: number;
}

const METER_TYPE_RULES: Record<MeterType, MeterTypeRules> = {
  grid_import: {
    allowedDecreaseKwh: 1,
    maxIncreaseKwhPerHour: 2.5,
    absoluteMaxIncreaseKwh: 2_000,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
  },
  solar_import: {
    allowedDecreaseKwh: 5,
    maxIncreaseKwhPerHour: 1.5,
    absoluteMaxIncreaseKwh: 500,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
  },
  solar_export: {
    allowedDecreaseKwh: 5,
    maxIncreaseKwhPerHour: 20,
    absoluteMaxIncreaseKwh: 2_000,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
  },
  solar_generation: {
    allowedDecreaseKwh: 0,
    maxIncreaseKwhPerHour: 20,
    absoluteMaxIncreaseKwh: 2_000,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 10_000,
  },
  generator: {
    allowedDecreaseKwh: 0,
    maxIncreaseKwhPerHour: 5.0,
    absoluteMaxIncreaseKwh: 2_000,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 10_000,
  },
  unit_submeter: {
    allowedDecreaseKwh: 2,
    maxIncreaseKwhPerHour: 1.0,
    absoluteMaxIncreaseKwh: 200,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 10_000,
  },
  unknown: {
    allowedDecreaseKwh: 1,
    maxIncreaseKwhPerHour: 2.5,
    absoluteMaxIncreaseKwh: 2_000,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
    rolloverDetectionFraction: 0.4,
  },
} as const;

export const VALIDATION_CONFIG = {
  MIN_CONFIDENCE: 0.78,
  ABSOLUTE_MAX_KWH: 1_000_000,
  REJECT_DUPLICATE_READING: true,
  DUPLICATE_WINDOW_MINUTES: 5,
  DEFAULT_ROLLOVER_DETECTION_FRACTION: 0.5,
  DUPLICATE_TOLERANCE_KWH: 0.01,
  MAX_RECENT_READINGS_TO_FETCH: 10,
  RESET_MARKER_KWH: -1,
  RESET_MARKER_TOLERANCE_HOURS: 48,
} as const;

// CHANGED: Added hoursSinceLastReading and maxAllowed to both branches
export type ValidationResult =
  | { valid: true; delta: number | null; prevKwh: number | null; deltaKwh?: number; imageHash?: string; hammingDistance?: number; visualMismatch?: boolean; reason?: never; flag?: 'meter_rollover' | 'first_reading' | 'after_reset'; hoursSinceLastReading?: number | null; maxAllowed?: number | null }
  | { valid: false; reason: string; delta?: never; prevKwh?: never; flag?: 'possible_meter_reset' | 'low_confidence'; hoursSinceLastReading?: never; maxAllowed?: never };

export interface ValidationHistoryReading {
  reading_kwh: number | string;
  captured_at: string;
  source?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ValidationContext {
  // Legacy callers may still provide userId/clusterId while they are being
  // retired. Canonical callers provide organizationId/assetId and history.
  userId?: string;
  clusterId?: string;
  organizationId?: string;
  assetId?: string;
  actorId?: string;
  newKwh: number;
  confidence: number;
  meterType: MeterType;
  imageUrl?: string;
  requestId?: string;
  logger?: Logger;
  overrideRules?: Partial<MeterTypeRules>;
  recentReadings?: ValidationHistoryReading[];
  recordFraudSignal?: (
    signalType: 'delta_spike' | 'rapid_submission' | 'visual_mismatch',
    severity: number,
    metadata: Record<string, unknown>
  ) => Promise<void>;
}

function createSafeLogger(base: Logger | undefined, context: Record<string, unknown>) {
  if (base && typeof base.child === 'function') {
    return base.child(context);
  }
  const prefix = Object.entries(context)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return {
    info: (obj: unknown, msg?: string) => console.log(`[INFO] ${prefix} ${msg ?? ''}`, obj),
    warn: (obj: unknown, msg?: string) => console.warn(`[WARN] ${prefix} ${msg ?? ''}`, obj),
    error: (obj: unknown, msg?: string) => console.error(`[ERROR] ${prefix} ${msg ?? ''}`, obj),
    debug: (obj: unknown, msg?: string) => console.debug(`[DEBUG] ${prefix} ${msg ?? ''}`, obj),
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

interface RolloverResult {
  isRollover: boolean;
  adjustedDelta: number;
  isPossibleReset: boolean;
}

function detectRollover(
  prev: number,
  next: number,
  threshold: number,
  detectionFraction: number
): RolloverResult {
  const directDelta = next - prev;
  const rolloverDelta = threshold - prev + next;
  const dropThreshold = -threshold * detectionFraction;
  const maxRolloverDelta = threshold * detectionFraction;

  const isRollover =
    directDelta <= dropThreshold &&
    prev > threshold - maxRolloverDelta &&
    next < maxRolloverDelta &&
    rolloverDelta > 0 &&
    rolloverDelta <= maxRolloverDelta;

  const isPossibleReset = directDelta <= dropThreshold && !isRollover;

  return {
    isRollover,
    adjustedDelta: isRollover ? rolloverDelta : directDelta,
    isPossibleReset,
  };
}

function computeMaxIncreaseKwh(rules: MeterTypeRules, hoursSinceLastReading: number | null): number {
  if (hoursSinceLastReading === null || hoursSinceLastReading <= 0) {
    return Math.min(rules.maxIncreaseKwhPerHour * 2, rules.absoluteMaxIncreaseKwh);
  }
  const proportional = rules.maxIncreaseKwhPerHour * hoursSinceLastReading;
  return Math.min(proportional, rules.absoluteMaxIncreaseKwh);
}

export async function validateReading(ctx: ValidationContext): Promise<ValidationResult> {
  const {
    userId,
    clusterId,
    organizationId,
    assetId,
    newKwh,
    confidence,
    meterType,
    imageUrl,
    requestId,
    overrideRules,
  } = ctx;
  const scopeIdentity = organizationId && assetId
    ? { organizationId, assetId }
    : { userId, clusterId };
  const log = createSafeLogger(ctx.logger, { requestId, ...scopeIdentity, meterType });

  if (
    (!organizationId?.trim() || !assetId?.trim()) &&
    (!userId?.trim() || !clusterId?.trim())
  ) {
    return { valid: false, reason: 'Missing reading authorization scope.' };
  }

  const baseRules = METER_TYPE_RULES[meterType] ?? METER_TYPE_RULES.unknown;
  const rules: MeterTypeRules = { ...baseRules, ...overrideRules };

  const sanitizedKwh = toNumber(newKwh);
  if (sanitizedKwh === null) {
    log.warn({ newKwh }, 'Invalid reading value type');
    return { valid: false, reason: 'Invalid reading value. Expected a number.' };
  }

  const sanitizedConfidence = toNumber(confidence);
  if (sanitizedConfidence === null || sanitizedConfidence < 0 || sanitizedConfidence > 1) {
    log.warn({ confidence }, 'Invalid confidence value');
    return { valid: false, reason: 'Invalid confidence score.' };
  }

  if (sanitizedConfidence < VALIDATION_CONFIG.MIN_CONFIDENCE) {
    log.info({ confidence: sanitizedConfidence }, 'Confidence below threshold');
    return {
      valid: false,
      reason: `Low OCR confidence (${sanitizedConfidence.toFixed(2)}). Please retake the photo with better lighting.`,
      flag: 'low_confidence',
    };
  }

  if (sanitizedKwh < 0 || sanitizedKwh > VALIDATION_CONFIG.ABSOLUTE_MAX_KWH) {
    log.warn({ newKwh: sanitizedKwh }, 'Reading out of absolute bounds');
    return {
      valid: false,
      reason: `Reading out of bounds (0 – ${VALIDATION_CONFIG.ABSOLUTE_MAX_KWH.toLocaleString()} kWh)`,
    };
  }

  const now = new Date();
  const duplicateWindow = new Date(
    now.getTime() - VALIDATION_CONFIG.DUPLICATE_WINDOW_MINUTES * 60 * 1000
  );

  let recentReadings = ctx.recentReadings;
  if (!recentReadings) {
    // Compatibility path for non-runtime legacy callers. The canonical runtime
    // supplies history explicitly and never queries the legacy schema.
    const { data, error } = await supabase
      .from('meter_readings')
      .select('reading_kwh, captured_at, id, source, status, metadata')
      .eq('user_id', userId)
      .eq('cluster_id', clusterId)
      .eq('meter_type', meterType)
      .order('captured_at', { ascending: false })
      .limit(VALIDATION_CONFIG.MAX_RECENT_READINGS_TO_FETCH);

    if (error) {
      log.error({ error }, 'Database query failed during legacy validation');
      return { valid: false, reason: 'Database error – please try again' };
    }
    recentReadings = data ?? [];
  }

  let lastActualReading: { reading_kwh: number; captured_at: string; metadata?: any } | null = null;
  let hoursSinceLastReading: number | null = null;

  for (const r of recentReadings ?? []) {
    const rKwh = toNumber(r.reading_kwh);
    if (rKwh === null) continue;

    const isResetMarker =
      rKwh === VALIDATION_CONFIG.RESET_MARKER_KWH ||
      r.source === 'user_reset' ||
      r.status === 'reset_marker';

    if (isResetMarker) {
      const markerAgeHours = r.captured_at
        ? (now.getTime() - new Date(r.captured_at).getTime()) / (1000 * 60 * 60)
        : Infinity;
      if (markerAgeHours <= VALIDATION_CONFIG.RESET_MARKER_TOLERANCE_HOURS) {
        log.info({ markerAgeHours }, 'Recent reset marker found; treating as first reading');
        return { valid: true, delta: null, prevKwh: null, flag: 'after_reset', hoursSinceLastReading: null, maxAllowed: null };
      }
      continue;
    }

    if (lastActualReading === null) {
      lastActualReading = { reading_kwh: rKwh, captured_at: r.captured_at, metadata: r.metadata };
      const prevTime = new Date(r.captured_at);
      hoursSinceLastReading = (now.getTime() - prevTime.getTime()) / (1000 * 60 * 60);
    }
  }

  if (VALIDATION_CONFIG.REJECT_DUPLICATE_READING && recentReadings && recentReadings.length > 0) {
    const isDuplicate = recentReadings.some((r) => {
      const rTime = r.captured_at ? new Date(r.captured_at) : null;
      const rKwh = toNumber(r.reading_kwh);
      if (!rTime || rKwh === null) return false;
      const isMarker = rKwh === VALIDATION_CONFIG.RESET_MARKER_KWH || r.source === 'user_reset' || r.status === 'reset_marker';
      if (isMarker) return false;
      return (
        rTime >= duplicateWindow &&
        Math.abs(rKwh - sanitizedKwh) < VALIDATION_CONFIG.DUPLICATE_TOLERANCE_KWH
      );
    });

    if (isDuplicate) {
      log.info({ newKwh: sanitizedKwh }, 'Duplicate reading rejected');
      if (ctx.recordFraudSignal) {
        await ctx.recordFraudSignal(
          'rapid_submission',
          0.3,
          { duplicateKwh: sanitizedKwh, windowMinutes: VALIDATION_CONFIG.DUPLICATE_WINDOW_MINUTES }
        );
      } else if (userId && clusterId) {
        await recordFraudSignal(
          userId,
          clusterId,
          'rapid_submission',
          0.3,
          { duplicateKwh: sanitizedKwh, windowMinutes: VALIDATION_CONFIG.DUPLICATE_WINDOW_MINUTES },
          log
        );
      }
      return {
        valid: false,
        reason: `This reading (${sanitizedKwh.toFixed(2)} kWh) was already submitted within the last ${VALIDATION_CONFIG.DUPLICATE_WINDOW_MINUTES} minutes.`,
      };
    }
  }

  if (lastActualReading === null) {
    log.info({ newKwh: sanitizedKwh }, 'First reading for this meter accepted as baseline');
    return { valid: true, delta: null, prevKwh: null, flag: 'first_reading', hoursSinceLastReading: null, maxAllowed: null };
  }

  const prevKwh = lastActualReading.reading_kwh;
  let delta = sanitizedKwh - prevKwh;

  if (rules.allowsRollover && rules.rolloverThreshold) {
    const detectionFraction =
      rules.rolloverDetectionFraction ?? VALIDATION_CONFIG.DEFAULT_ROLLOVER_DETECTION_FRACTION;
    const rollover = detectRollover(prevKwh, sanitizedKwh, rules.rolloverThreshold, detectionFraction);

    if (rollover.isPossibleReset) {
      log.warn({ prevKwh, newKwh: sanitizedKwh, delta }, 'Possible meter reset detected');
      return {
        valid: false,
        reason: `Reading dropped by ${Math.abs(delta).toFixed(1)} kWh. This may be a new or replaced meter. Use /resetmeter to set a new baseline, or contact support.`,
        flag: 'possible_meter_reset',
      };
    }

    if (rollover.isRollover) {
      if (rollover.adjustedDelta > computeMaxIncreaseKwh(rules, hoursSinceLastReading)) {
        log.warn({ prevKwh, newKwh: sanitizedKwh, adjustedDelta: rollover.adjustedDelta }, 'Rollover delta too large');
        return {
          valid: false,
          reason: `Meter rollover detected, but the resulting increase (${rollover.adjustedDelta.toFixed(1)} kWh) exceeds the maximum allowed. Please verify the reading.`,
        };
      }
      log.info({ prevKwh, newKwh: sanitizedKwh, adjustedDelta: rollover.adjustedDelta }, 'Meter rollover accepted');
      delta = rollover.adjustedDelta;
    }
  }

  if ((meterType === 'solar_generation' || meterType === 'generator') && delta < 0) {
    log.warn({ prevKwh, newKwh: sanitizedKwh, delta }, 'Generative meter cannot decrease');
    return {
      valid: false,
      reason: `${meterType.replace('_', ' ')} readings cannot decrease. Please check the photo captures the correct meter.`,
    };
  }

  if (rules.strictMonotonic && delta < -rules.allowedDecreaseKwh) {
    log.warn({ prevKwh, newKwh: sanitizedKwh, delta, allowedDecrease: rules.allowedDecreaseKwh }, 'Reading decreased beyond tolerance');
    return {
      valid: false,
      reason: `Reading decreased by ${Math.abs(delta).toFixed(1)} kWh (max allowed decrease: ${rules.allowedDecreaseKwh} kWh).`,
    };
  }

  const maxIncreaseKwh = computeMaxIncreaseKwh(rules, hoursSinceLastReading);
  if (delta > maxIncreaseKwh) {
    log.warn({ prevKwh, newKwh: sanitizedKwh, delta, maxAllowed: maxIncreaseKwh, hoursSinceLastReading }, 'Delta exceeds maximum');
    if (ctx.recordFraudSignal) {
      await ctx.recordFraudSignal(
        'delta_spike',
        Math.min(0.9, (delta / maxIncreaseKwh) * 0.3),
        { delta, maxAllowed: maxIncreaseKwh, hoursSinceLastReading, meterType }
      );
    } else if (userId && clusterId) {
      await recordFraudSignal(
        userId,
        clusterId,
        'delta_spike',
        Math.min(0.9, (delta / maxIncreaseKwh) * 0.3),
        { delta, maxAllowed: maxIncreaseKwh, hoursSinceLastReading, meterType },
        log
      );
    }
    return {
      valid: false,
      reason: `Unusually large increase (${delta.toFixed(1)} kWh in ${(hoursSinceLastReading ?? 0).toFixed(1)} hrs). The maximum allowed for ${meterType} is ${maxIncreaseKwh.toFixed(1)} kWh. Please verify the reading.`,
    };
  }
  // Visual fingerprint check
  let imageHash: string | undefined;
  let visualMismatch = false;
  let hammingDistance = 0;

  if (imageUrl && lastActualReading) {
    try {
      const { generateFingerprint, hammingDistance: computeHamming, isVisuallySame } = await import('./imageFingerprint.js');
      const current = await generateFingerprint(imageUrl);
      imageHash = current.hash;

      const prevHash = lastActualReading.metadata?.image_hash;
      if (prevHash) {
        hammingDistance = computeHamming(current.hash, prevHash);
        visualMismatch = !isVisuallySame(current.hash, prevHash);
        if (visualMismatch) {
          log.warn({ hammingDistance, prevHashPrefix: prevHash.slice(0, 16) }, 'Visual mismatch detected');
          if (ctx.recordFraudSignal) {
            await ctx.recordFraudSignal(
              'visual_mismatch',
              0.5,
              { hammingDistance, prevHashPrefix: prevHash.slice(0, 16) }
            );
          } else if (userId && clusterId) {
            await recordFraudSignal(
              userId,
              clusterId,
              'visual_mismatch',
              0.5,
              { hammingDistance, prevHashPrefix: prevHash.slice(0, 16) },
              log
            );
          }
        }
      }
    } catch (err) {
      log.warn({ err }, 'Fingerprinting failed, allowing reading');
    }
  }

  const resultFlag = delta !== sanitizedKwh - prevKwh ? 'meter_rollover' : undefined;
  log.info({ prevKwh, newKwh: sanitizedKwh, delta, hoursSinceLastReading, hammingDistance, visualMismatch }, 'Reading validated successfully');
  return { valid: true, delta, prevKwh, deltaKwh: delta, imageHash, hammingDistance, visualMismatch, flag: resultFlag, hoursSinceLastReading, maxAllowed: maxIncreaseKwh };
}

export function getValidationFailureReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

