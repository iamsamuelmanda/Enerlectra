// integrations/telegram-bot/src/services/validation.ts
import { supabase } from '../lib/supabase';
import type { MeterType } from './ocr';
import type { Logger } from 'pino';

/**
 * PRODUCTION-GRADE READING VALIDATION — PERFECTED
 * - Fully configurable per meter type
 * - Handles meter rollover with adjustable detection threshold
 * - Idempotent (rejects duplicate readings within window)
 * - Structured logging with request ID correlation
 * - Strict TypeScript with exhaustive type checking
 * - Safe logger fallback (no runtime crashes)
 * - Runtime configuration overrides via optional params
 */

// ====================== CONFIGURATION ======================
interface MeterTypeRules {
  /** Maximum allowed decrease between consecutive readings (kWh). */
  allowedDecreaseKwh: number;
  /** Maximum allowed increase between consecutive readings (kWh). */
  maxIncreaseKwh: number;
  /** Enforce that reading never decreases beyond allowedDecreaseKwh. */
  strictMonotonic: boolean;
  /** Whether this meter type can roll over (e.g., odometer). */
  allowsRollover: boolean;
  /** The rollover threshold (e.g., 100000 for 6‑digit meters). */
  rolloverThreshold?: number;
  /** Fraction of threshold used for rollover detection (default 0.5). */
  rolloverDetectionFraction?: number;
}

const METER_TYPE_RULES: Record<MeterType, MeterTypeRules> = {
  grid_import: {
    allowedDecreaseKwh: 5,
    maxIncreaseKwh: 100,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
  },
  solar_import: {
    allowedDecreaseKwh: 5,
    maxIncreaseKwh: 100,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
  },
  solar_export: {
    allowedDecreaseKwh: 5,
    maxIncreaseKwh: 100,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
  },
  solar_generation: {
    allowedDecreaseKwh: 0,
    maxIncreaseKwh: 200,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 10_000,
  },
  generator: {
    allowedDecreaseKwh: 0,
    maxIncreaseKwh: 500,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 10_000,
  },
  unit_submeter: {
    allowedDecreaseKwh: 2,
    maxIncreaseKwh: 50,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 10_000,
  },
  unknown: {
    allowedDecreaseKwh: 10,
    maxIncreaseKwh: 200,
    strictMonotonic: false,
    allowsRollover: true,
    rolloverThreshold: 100_000,
    rolloverDetectionFraction: 0.4, // more sensitive for unknown meters
  },
} as const;

export const VALIDATION_CONFIG = {
  MIN_CONFIDENCE: 0.78,
  ABSOLUTE_MAX_KWH: 1_000_000,
  REJECT_DUPLICATE_READING: true,
  DUPLICATE_WINDOW_MINUTES: 5,
  DEFAULT_ROLLOVER_DETECTION_FRACTION: 0.5,
} as const;

// ====================== TYPES ======================
export type ValidationResult =
  | { valid: true; delta: number | null; reason?: never }
  | { valid: false; reason: string; delta?: never };

export interface ValidationContext {
  userId: string;
  clusterId: string;
  newKwh: number;
  confidence: number;
  meterType: MeterType;
  requestId?: string;
  logger?: Logger;
  /** Override default validation rules (useful for admin corrections). */
  overrideRules?: Partial<MeterTypeRules>;
}

// ====================== LOGGER FALLBACK (SAFE) ======================
function createSafeLogger(base: Logger | undefined, context: Record<string, unknown>) {
  if (base && typeof base.child === 'function') {
    return base.child(context);
  }
  // Fallback to plain console with context prefixed
  const prefix = Object.entries(context)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return {
    info: (obj: unknown, msg?: string) =>
      console.log(`[INFO] ${prefix} ${msg ?? ''}`, obj),
    warn: (obj: unknown, msg?: string) =>
      console.warn(`[WARN] ${prefix} ${msg ?? ''}`, obj),
    error: (obj: unknown, msg?: string) =>
      console.error(`[ERROR] ${prefix} ${msg ?? ''}`, obj),
    debug: (obj: unknown, msg?: string) =>
      console.debug(`[DEBUG] ${prefix} ${msg ?? ''}`, obj),
  };
}

// ====================== HELPER: ROLLOVER DETECTION ======================
function detectRollover(
  prev: number,
  next: number,
  threshold: number,
  detectionFraction: number = VALIDATION_CONFIG.DEFAULT_ROLLOVER_DETECTION_FRACTION
): { isRollover: boolean; adjustedDelta: number } {
  const directDelta = next - prev;
  const rolloverDelta = threshold - prev + next;

  // Rollover occurs when reading drops significantly and the adjusted delta is plausible
  const isRollover =
    directDelta < -threshold * detectionFraction &&
    rolloverDelta > 0 &&
    rolloverDelta < threshold * detectionFraction;

  return {
    isRollover,
    adjustedDelta: isRollover ? rolloverDelta : directDelta,
  };
}

// ====================== MAIN VALIDATION FUNCTION ======================
export async function validateReading(ctx: ValidationContext): Promise<ValidationResult> {
  const { userId, clusterId, newKwh, confidence, meterType, requestId, overrideRules } = ctx;
  const log = createSafeLogger(ctx.logger, { requestId, userId, clusterId, meterType });

  // Merge default rules with overrides
  const baseRules = METER_TYPE_RULES[meterType];
  const rules: MeterTypeRules = {
    ...baseRules,
    ...overrideRules,
  };

  // ── 0. Absolute bounds ─────────────────────────────────────────────
  if (newKwh < 0 || newKwh > VALIDATION_CONFIG.ABSOLUTE_MAX_KWH) {
    log.warn({ newKwh }, 'Reading out of absolute bounds');
    return {
      valid: false,
      reason: `Reading out of bounds (0 – ${VALIDATION_CONFIG.ABSOLUTE_MAX_KWH} kWh)`,
    };
  }

  if (confidence < VALIDATION_CONFIG.MIN_CONFIDENCE) {
    log.info({ confidence }, 'Confidence below threshold');
    return {
      valid: false,
      reason: `Low confidence (${confidence.toFixed(2)}). Please retake photo.`,
    };
  }

  // ── 1. Fetch last reading + duplicate check ────────────────────────
  const now = new Date();
  const duplicateWindow = new Date(
    now.getTime() - VALIDATION_CONFIG.DUPLICATE_WINDOW_MINUTES * 60 * 1000
  );

  const { data: lastReadings, error } = await supabase
    .from('meter_readings')
    .select('reading_kwh, created_at')
    .eq('user_id', userId)
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    log.error({ error }, 'Database query failed during validation');
    return { valid: false, reason: 'Database error – please try again' };
  }

  const lastReading = lastReadings?.[0] ?? null;
  const prevKwh = lastReading?.reading_kwh ?? null;
  const prevTimestamp = lastReading?.created_at ? new Date(lastReading.created_at) : null;

  // ── 1a. Idempotency: reject exact duplicate ────────────────────────
  if (
    VALIDATION_CONFIG.REJECT_DUPLICATE_READING &&
    prevKwh === newKwh &&
    prevTimestamp &&
    prevTimestamp > duplicateWindow
  ) {
    log.info({ prevKwh, newKwh }, 'Duplicate reading rejected');
    return {
      valid: false,
      reason: 'This reading was already submitted recently.',
    };
  }

  // ── 2. First reading ────────────────────────────────────────────────
  if (prevKwh === null) {
    log.info('First reading accepted');
    return { valid: true, delta: null };
  }

  // ── 3. Apply meter‑type specific rules ──────────────────────────────
  let delta = newKwh - prevKwh;

  // Handle rollover if applicable
  if (rules.allowsRollover && rules.rolloverThreshold) {
    const detectionFraction = rules.rolloverDetectionFraction ?? VALIDATION_CONFIG.DEFAULT_ROLLOVER_DETECTION_FRACTION;
    const rollover = detectRollover(prevKwh, newKwh, rules.rolloverThreshold, detectionFraction);
    if (rollover.isRollover) {
      log.info({ prevKwh, newKwh, adjustedDelta: rollover.adjustedDelta }, 'Meter rollover detected');
      delta = rollover.adjustedDelta;
    }
  }

  // ── 3a. Cumulative decrease check ───────────────────────────────────
  if (rules.strictMonotonic && delta < -rules.allowedDecreaseKwh) {
    log.warn(
      { prevKwh, newKwh, delta, allowedDecrease: rules.allowedDecreaseKwh },
      'Reading decreased unacceptably'
    );
    return {
      valid: false,
      reason: `Reading decreased by ${Math.abs(delta).toFixed(1)} kWh (max allowed decrease: ${rules.allowedDecreaseKwh} kWh)`,
    };
  }

  // ── 3b. Generative meters: ensure non‑negative delta ────────────────
  if ((meterType === 'solar_generation' || meterType === 'generator') && delta < 0) {
    log.warn({ prevKwh, newKwh, delta }, 'Generative meter cannot decrease');
    return {
      valid: false,
      reason: `${meterType.replace('_', ' ')} cannot decrease. Please check reading.`,
    };
  }

  // ── 4. Delta sanity (max increase) ──────────────────────────────────
  if (delta > rules.maxIncreaseKwh) {
    log.warn({ prevKwh, newKwh, delta, maxAllowed: rules.maxIncreaseKwh }, 'Delta exceeds maximum');
    return {
      valid: false,
      reason: `Unusually large increase (${delta.toFixed(1)} kWh). Please verify reading.`,
    };
  }

  // ── 5. Success ──────────────────────────────────────────────────────
  log.info({ prevKwh, newKwh, delta }, 'Reading validated successfully');
  return { valid: true, delta };
}

// ====================== UTILITY: VALIDATION SUMMARY FOR METRICS ======================
export function getValidationFailureReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}