// integrations/telegram-bot/src/services/validation.ts
import { supabase } from '../lib/supabase';
import type { MeterType } from './ocr';
import type { Logger } from 'pino';

/**
 * PRODUCTION-GRADE READING VALIDATION — REFACTORED
 * - Per-meter-type tracking (prevents cross-meter contamination)
 * - Tolerant duplicate detection across recent window
 * - Conservative rollover detection with reset safeguards
 * - Time-proportional maxIncreaseKwh (scales with elapsed hours)
 * - Strict input sanitization
 * - Structured logging with request ID correlation
 */

// ====================== CONFIGURATION ======================
interface MeterTypeRules {
  /** Maximum allowed decrease between consecutive readings (kWh). */
  allowedDecreaseKwh: number;
  /** Maximum allowed increase per hour between readings (kWh/hr). */
  maxIncreaseKwhPerHour: number;
  /** Absolute ceiling for maxIncreaseKwh regardless of elapsed time. */
  absoluteMaxIncreaseKwh: number;
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
    allowedDecreaseKwh: 1,
    maxIncreaseKwhPerHour: 2.5,     // ~60 kWh/day for residential
    absoluteMaxIncreaseKwh: 2_000,  // commercial safety cap
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
    maxIncreaseKwhPerHour: 1.5,
    absoluteMaxIncreaseKwh: 500,
    strictMonotonic: true,
    allowsRollover: true,
    rolloverThreshold: 100_000,
  },
  solar_generation: {
    allowedDecreaseKwh: 0,
    maxIncreaseKwhPerHour: 3.0,
    absoluteMaxIncreaseKwh: 1_000,
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
  RESET_MARKER_TOLERANCE_HOURS: 48, // reset markers older than this are ignored
} as const;

// ====================== TYPES ======================
export type ValidationResult =
  | { valid: true; delta: number | null; reason?: never; flag?: 'meter_rollover' | 'first_reading' | 'after_reset' }
  | { valid: false; reason: string; delta?: never; flag?: 'possible_meter_reset' | 'low_confidence' };

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

// ====================== HELPER: SAFE NUMBER PARSING ======================
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// ====================== HELPER: ROLLOVER DETECTION ======================
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

// ====================== HELPER: TIME-PROPORTIONAL MAX INCREASE ======================
function computeMaxIncreaseKwh(
  rules: MeterTypeRules,
  hoursSinceLastReading: number | null
): number {
  if (hoursSinceLastReading === null || hoursSinceLastReading <= 0) {
    // First reading or same-hour reading: use a small default buffer
    return Math.min(rules.maxIncreaseKwhPerHour * 2, rules.absoluteMaxIncreaseKwh);
  }
  const proportional = rules.maxIncreaseKwhPerHour * hoursSinceLastReading;
  return Math.min(proportional, rules.absoluteMaxIncreaseKwh);
}

// ====================== MAIN VALIDATION FUNCTION ======================
export async function validateReading(ctx: ValidationContext): Promise<ValidationResult> {
  const { userId, clusterId, newKwh, confidence, meterType, requestId, overrideRules } = ctx;
  const log = createSafeLogger(ctx.logger, { requestId, userId, clusterId, meterType });

  // ── 0. Identifier validation ────────────────────────────────────────
  if (!userId?.trim() || !clusterId?.trim()) {
    return { valid: false, reason: 'Missing user or cluster identifier.' };
  }

  const baseRules = METER_TYPE_RULES[meterType] ?? METER_TYPE_RULES.unknown;
  const rules: MeterTypeRules = { ...baseRules, ...overrideRules };

  // ── 1. Input sanitization ───────────────────────────────────────────
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

  // ── 2. Confidence check ─────────────────────────────────────────────
  if (sanitizedConfidence < VALIDATION_CONFIG.MIN_CONFIDENCE) {
    log.info({ confidence: sanitizedConfidence }, 'Confidence below threshold');
    return {
      valid: false,
      reason: `Low OCR confidence (${sanitizedConfidence.toFixed(2)}). Please retake the photo with better lighting.`,
      flag: 'low_confidence',
    };
  }

  // ── 3. Absolute bounds ──────────────────────────────────────────────
  if (sanitizedKwh < 0 || sanitizedKwh > VALIDATION_CONFIG.ABSOLUTE_MAX_KWH) {
    log.warn({ newKwh: sanitizedKwh }, 'Reading out of absolute bounds');
    return {
      valid: false,
      reason: `Reading out of bounds (0 – ${VALIDATION_CONFIG.ABSOLUTE_MAX_KWH.toLocaleString()} kWh)`,
    };
  }

  // ── 4. Fetch recent readings for THIS meter type ────────────────────
  const now = new Date();
  const duplicateWindow = new Date(
    now.getTime() - VALIDATION_CONFIG.DUPLICATE_WINDOW_MINUTES * 60 * 1000
  );

  const { data: recentReadings, error } = await supabase
    .from('meter_readings')
    .select('reading_kwh, captured_at, id, status')
    .eq('user_id', userId)
    .eq('cluster_id', clusterId)
    .eq('meter_type', meterType)
    .order('captured_at', { ascending: false })
    .limit(VALIDATION_CONFIG.MAX_RECENT_READINGS_TO_FETCH);

  if (error) {
    log.error({ error }, 'Database query failed during validation');
    return { valid: false, reason: 'Database error – please try again' };
  }

  // ── 5. Handle reset markers ─────────────────────────────────────────
  // Filter out reset markers and find the most recent actual reading
  let lastActualReading: { reading_kwh: number; captured_at: string } | null = null;
  let resetMarkerFound = false;
  let hoursSinceLastReading: number | null = null;

  for (const r of recentReadings ?? []) {
    const rKwh = toNumber(r.reading_kwh);
    if (rKwh === null) continue;

    if (r.status === 'reset_marker' || rKwh === VALIDATION_CONFIG.RESET_MARKER_KWH) {
      resetMarkerFound = true;
      const markerAgeHours = r.captured_at
        ? (now.getTime() - new Date(r.captured_at).getTime()) / (1000 * 60 * 60)
        : Infinity;
      if (markerAgeHours <= VALIDATION_CONFIG.RESET_MARKER_TOLERANCE_HOURS) {
        // Valid reset marker: treat next reading as first reading
        log.info({ markerAgeHours }, 'Recent reset marker found; treating as first reading');
        return { valid: true, delta: null, flag: 'after_reset' };
      }
      // Stale marker: continue looking for an actual reading
      continue;
    }

    if (lastActualReading === null) {
      lastActualReading = { reading_kwh: rKwh, captured_at: r.captured_at };
      const prevTime = new Date(r.captured_at);
      hoursSinceLastReading = (now.getTime() - prevTime.getTime()) / (1000 * 60 * 60);
    }
  }

  // ── 6. Idempotency: check for near-duplicate in window ──────────────
  if (VALIDATION_CONFIG.REJECT_DUPLICATE_READING && recentReadings && recentReadings.length > 0) {
    const isDuplicate = recentReadings.some((r) => {
      const rTime = r.captured_at ? new Date(r.captured_at) : null;
      const rKwh = toNumber(r.reading_kwh);
      if (!rTime || rKwh === null) return false;
      // Skip reset markers in duplicate check
      if (r.status === 'reset_marker' || rKwh === VALIDATION_CONFIG.RESET_MARKER_KWH) return false;
      return (
        rTime >= duplicateWindow &&
        Math.abs(rKwh - sanitizedKwh) < VALIDATION_CONFIG.DUPLICATE_TOLERANCE_KWH
      );
    });

    if (isDuplicate) {
      log.info({ newKwh: sanitizedKwh }, 'Duplicate reading rejected');
      return {
        valid: false,
        reason: `This reading (${sanitizedKwh.toFixed(2)} kWh) was already submitted within the last ${VALIDATION_CONFIG.DUPLICATE_WINDOW_MINUTES} minutes.`,
      };
    }
  }

  // ── 7. First reading for this meter ─────────────────────────────────
  if (lastActualReading === null) {
    log.info('First reading for this meter accepted');
    return { valid: true, delta: null, flag: 'first_reading' };
  }

  const prevKwh = lastActualReading.reading_kwh;

  // ── 8. Calculate delta with rollover handling ───────────────────────
  let delta = sanitizedKwh - prevKwh;

  if (rules.allowsRollover && rules.rolloverThreshold) {
    const detectionFraction =
      rules.rolloverDetectionFraction ?? VALIDATION_CONFIG.DEFAULT_ROLLOVER_DETECTION_FRACTION;

    const rollover = detectRollover(prevKwh, sanitizedKwh, rules.rolloverThreshold, detectionFraction);

    if (rollover.isPossibleReset) {
      log.warn(
        { prevKwh, newKwh: sanitizedKwh, delta },
        'Possible meter reset detected (large decrease not matching rollover pattern)'
      );
      return {
        valid: false,
        reason: `Reading dropped by ${Math.abs(delta).toFixed(1)} kWh. This may be a new or replaced meter. Use /resetmeter to set a new baseline, or contact support.`,
        flag: 'possible_meter_reset',
      };
    }

    if (rollover.isRollover) {
      if (rollover.adjustedDelta > computeMaxIncreaseKwh(rules, hoursSinceLastReading)) {
        log.warn(
          { prevKwh, newKwh: sanitizedKwh, adjustedDelta: rollover.adjustedDelta },
          'Rollover detected but adjusted delta exceeds maximum allowed increase'
        );
        return {
          valid: false,
          reason: `Meter rollover detected, but the resulting increase (${rollover.adjustedDelta.toFixed(1)} kWh) exceeds the maximum allowed. Please verify the reading.`,
        };
      }
      log.info(
        { prevKwh, newKwh: sanitizedKwh, adjustedDelta: rollover.adjustedDelta },
        'Meter rollover accepted'
      );
      delta = rollover.adjustedDelta;
    }
  }

  // ── 9. Decrease checks ──────────────────────────────────────────────
  if ((meterType === 'solar_generation' || meterType === 'generator') && delta < 0) {
    log.warn({ prevKwh, newKwh: sanitizedKwh, delta }, 'Generative meter cannot decrease');
    return {
      valid: false,
      reason: `${meterType.replace('_', ' ')} readings cannot decrease. Please check the photo captures the correct meter.`,
    };
  }

  if (rules.strictMonotonic && delta < -rules.allowedDecreaseKwh) {
    log.warn(
      { prevKwh, newKwh: sanitizedKwh, delta, allowedDecrease: rules.allowedDecreaseKwh },
      'Reading decreased beyond allowed tolerance'
    );
    return {
      valid: false,
      reason: `Reading decreased by ${Math.abs(delta).toFixed(1)} kWh (max allowed decrease: ${rules.allowedDecreaseKwh} kWh).`,
    };
  }

  // ── 10. Time-proportional delta sanity (max increase) ───────────────
  const maxIncreaseKwh = computeMaxIncreaseKwh(rules, hoursSinceLastReading);

  if (delta > maxIncreaseKwh) {
    log.warn(
      { prevKwh, newKwh: sanitizedKwh, delta, maxAllowed: maxIncreaseKwh, hoursSinceLastReading },
      'Delta exceeds time-proportional maximum'
    );
    return {
      valid: false,
      reason: `Unusually large increase (${delta.toFixed(1)} kWh in ${(hoursSinceLastReading ?? 0).toFixed(1)} hrs). The maximum allowed for ${meterType} is ${maxIncreaseKwh.toFixed(1)} kWh. Please verify the reading.`,
    };
  }

  // ── 11. Success ─────────────────────────────────────────────────────
  const resultFlag = delta !== sanitizedKwh - prevKwh ? 'meter_rollover' : undefined;
  log.info({ prevKwh, newKwh: sanitizedKwh, delta, hoursSinceLastReading }, 'Reading validated successfully');
  return { valid: true, delta, flag: resultFlag };
}

// ====================== UTILITY: VALIDATION SUMMARY FOR METRICS ======================
export function getValidationFailureReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}