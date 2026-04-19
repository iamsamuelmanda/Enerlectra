// integrations/telegram-bot/src/services/ocr.ts
// PRODUCTION-GRADE HYBRID MULTI-METER OCR SERVICE
//
// Fallback chain:
//   1. Tesseract (local, free, always runs — meter-optimized preprocessing)
//   2. Claude Haiku vision (base64, specialized meter prompt)
//   3. Manual entry prompt (when Claude credits exhausted or both fail)
//
// Key improvements over previous version:
//   • Meter-specific image preprocessing (aggressive contrast for LCD/7-seg)
//   • Specialized Claude prompt — treats Claude as a meter specialist
//   • Claude results ALWAYS return status:'review' — human confirms before save
//   • Credits exhausted / API down → graceful degradation to manual entry
//   • @upstash/redis REST cache — no TCP, works on Render free tier

import { createScheduler, createWorker, PSM, OEM } from 'tesseract.js';
import type { Scheduler, Line, Word } from 'tesseract.js';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { Counter, Histogram, Registry } from 'prom-client';
import { createHash } from 'node:crypto';
import pino from 'pino';
import { URL } from 'node:url';

// ====================== LOGGER ======================
let _logger: pino.Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
});

export function setLogger(logger: pino.Logger): void { _logger = logger; }
function getLogger(): pino.Logger { return _logger; }

// ====================== CONFIG ======================
const OCR_CONFIG = {
  CONFIDENCE_THRESHOLD:  0.82,
  FALLBACK_CONFIDENCE:   0.85,
  SANITY_DELTA_MAX_KWH:  500,   // increased — first readings can be large
  ABSOLUTE_MAX_KWH:      999_999,
  CLAUDE_MODEL:          'claude-haiku-4-5-20251001' as const,
  WORKER_COUNT:          parseInt(process.env.TESSERACT_WORKERS ?? '1', 10),
  CACHE_TTL:             parseInt(process.env.REDIS_CACHE_TTL   ?? '3600', 10),
  REQUEST_TIMEOUT_MS:    parseInt(process.env.OCR_REQUEST_TIMEOUT_MS ?? '15000', 10),
  MAX_IMAGE_BYTES:       parseInt(process.env.MAX_IMAGE_BYTES   ?? `${10 * 1024 * 1024}`, 10),
} as const;

// ====================== WORKER POOL ======================
let _scheduler: Scheduler | null = null;
let _schedulerInit: Promise<Scheduler> | null = null;
let _schedulerCreatedAt = 0;
const WORKER_MAX_AGE_MS = 30 * 60 * 1000;

async function buildScheduler(): Promise<Scheduler> {
  const scheduler = createScheduler();
  const workers = await Promise.all(
    Array.from({ length: OCR_CONFIG.WORKER_COUNT }, async (_, idx) => {
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        logger: (m) => { if (m.status === 'error') getLogger().warn({ workerId: idx, ...m }, 'Tesseract worker error'); },
      });
      await worker.setParameters({
        tessedit_pageseg_mode:   PSM.SINGLE_BLOCK,
        // Digit-focused — reduces character confusion on LCD/7-segment displays
        tessedit_char_whitelist: '0123456789., ',
      });
      return worker;
    })
  );
  workers.forEach(w => scheduler.addWorker(w));
  getLogger().info({ workerCount: workers.length }, 'Tesseract scheduler initialized');
  return scheduler;
}

export async function getScheduler(): Promise<Scheduler> {
  const now = Date.now();
  if (_scheduler && now - _schedulerCreatedAt > WORKER_MAX_AGE_MS) {
    getLogger().info('Recycling Tesseract workers due to age');
    await _scheduler.terminate();
    _scheduler = null;
  }
  if (_scheduler) return _scheduler;
  if (_schedulerInit) return _schedulerInit;

  _schedulerInit = buildScheduler().then(s => {
    _scheduler = s; _schedulerCreatedAt = Date.now(); _schedulerInit = null; return s;
  }).catch(err => { _schedulerInit = null; throw err; });
  return _schedulerInit;
}

// ====================== REDIS CACHE ======================
let _redis: Redis | null = null;
let _redisDisabled = false;

function getRedis(): Redis | null {
  if (_redisDisabled) return null;
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _redisDisabled = true;
    getLogger().info('Upstash REST credentials not set – caching disabled');
    return null;
  }
  try {
    _redis = new Redis({ url, token });
    getLogger().info('Upstash Redis REST client initialized');
    return _redis;
  } catch (err) {
    getLogger().warn({ err }, 'Failed to initialize Upstash Redis – caching disabled');
    _redisDisabled = true;
    return null;
  }
}

async function cacheGet(key: string): Promise<MeterOcrResult | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get<string>(key);
    return raw ? JSON.parse(raw) as MeterOcrResult : null;
  } catch { return null; }
}

async function cacheSet(key: string, value: MeterOcrResult): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.setex(key, OCR_CONFIG.CACHE_TTL, JSON.stringify(value));
  } catch { /* non-fatal */ }
}

async function cacheKeyFor(imageUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2_000);
    const res = await fetch(imageUrl, { method: 'HEAD', signal: controller.signal });
    clearTimeout(id);
    const etag = res.headers.get('etag');
    if (etag) return `ocr:e:${createHash('sha256').update(etag).digest('hex')}`;
    const lm = res.headers.get('last-modified');
    if (lm) return `ocr:lm:${createHash('sha256').update(imageUrl + lm).digest('hex')}`;
  } catch { /* fall through */ }
  return `ocr:url:${createHash('sha256').update(imageUrl).digest('hex')}`;
}

// ====================== METRICS ======================
export const ocrRegistry = new Registry();

const ocrRequestsTotal = new Counter({
  name: 'ocr_requests_total', help: 'Total OCR requests',
  labelNames: ['status', 'source', 'cache'] as const, registers: [ocrRegistry],
});
const ocrDurationSeconds = new Histogram({
  name: 'ocr_duration_seconds', help: 'OCR latency',
  labelNames: ['status', 'source'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20], registers: [ocrRegistry],
});

export async function getOCRMetrics(): Promise<string> { return ocrRegistry.metrics(); }

// ====================== IMAGE PROCESSING ======================
function validateImageUrl(url: string): void {
  try { new URL(url); } catch { throw new Error('Invalid image URL'); }
}

async function fetchImageBuffer(imageUrl: string, timeoutMs: number): Promise<Uint8Array> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > OCR_CONFIG.MAX_IMAGE_BYTES) {
      throw new Error(`Image too large: ${contentLength} bytes`);
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > OCR_CONFIG.MAX_IMAGE_BYTES) throw new Error(`Image too large after fetch`);
    return new Uint8Array(buffer);
  } finally { clearTimeout(id); }
}

/**
 * Meter-optimized preprocessing.
 *
 * LCD and mechanical counter meters have specific visual characteristics:
 * - Low contrast between digit segments and background
 * - Glare from glass covers
 * - Slight rotation from handheld photos
 *
 * Pipeline:
 * 1. Greyscale — remove color noise
 * 2. Normalize — stretch histogram to full 0-255 range
 * 3. Linear contrast boost — push mid-tones to extremes
 * 4. Sharpen aggressively — crisp segment edges
 * 5. PNG — lossless for OCR accuracy
 */
async function preprocessImage(buffer: Uint8Array): Promise<Buffer> {
  return sharp(Buffer.from(buffer))
    .greyscale()
    .normalize()
    .linear(1.8, -(128 * 0.8))   // aggressive contrast for LCD segments
    .sharpen({ sigma: 2.0, m1: 0, m2: 3, x1: 2, y2: 10, y3: 20 })
    .png()
    .toBuffer();
}

// ====================== NUMBER PARSING ======================
export function parseNumericString(raw: string): number | null {
  const seps: { char: string; digitsBefore: number; digitsAfter: number }[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === ',' || raw[i] === '.') {
      seps.push({
        char: raw[i],
        digitsBefore: raw.slice(0, i).replace(/\D/g, '').length,
        digitsAfter: (raw.slice(i + 1).match(/^\d+/) ?? [''])[0].length,
      });
    }
  }
  if (seps.length === 0) { const v = parseFloat(raw); return isNaN(v) ? null : v; }
  const chars = new Set(seps.map(s => s.char));
  if (chars.size > 1) {
    const decChar = seps[seps.length - 1].char;
    const thouChar = decChar === '.' ? ',' : '.';
    let out = '';
    for (const ch of raw) out += ch === thouChar ? '' : ch === decChar ? '.' : ch;
    const v = parseFloat(out); return isNaN(v) ? null : v;
  }
  if (seps.length > 1) {
    const sep = seps[0].char;
    let out = '';
    for (const ch of raw) { if (ch !== sep) out += ch; }
    const v = parseFloat(out); return isNaN(v) ? null : v;
  }
  const s = seps[0];
  const normalised = (s.digitsAfter === 3 && s.digitsBefore <= 3)
    ? raw.replace(s.char, '') : raw.replace(s.char, '.');
  const v = parseFloat(normalised); return isNaN(v) ? null : v;
}

// ====================== METER TYPE ======================
export type MeterType =
  | 'grid_import' | 'solar_import' | 'solar_export'
  | 'solar_generation' | 'unit_submeter' | 'generator' | 'unknown';

export function detectMeterType(text: string): MeterType {
  const lower = text.toLowerCase();
  const scores: Record<MeterType, number> = {
    grid_import: 0, solar_import: 0, solar_export: 0,
    solar_generation: 0, unit_submeter: 0, generator: 0, unknown: 0,
  };
  if (lower.includes('export'))                              scores.solar_export     += 3;
  if (lower.includes('import'))                              scores.grid_import      += 2;
  if (lower.includes('grid'))                                scores.grid_import      += 3;
  if (lower.includes('solar') || lower.includes('pv')) {    scores.solar_generation += 2; scores.solar_export += 1; }
  if (lower.includes('unit') || lower.includes('sub'))       scores.unit_submeter    += 3;
  if (/\bgen\b/.test(lower))                                scores.generator        += 3;
  if (lower.includes('generation'))                          scores.solar_generation += 2;
  const best = Object.entries(scores).reduce((a, b) => (a[1] >= b[1] ? a : b));
  return (best[1] > 0 ? best[0] : 'grid_import') as MeterType;
}

// ====================== EXTRACTION ======================
export interface ExtractedReading {
  value: number; label?: string; confidence: number; rawText: string;
}

interface ExtractionResult {
  bestReading: number | null; rawText: string; meterType: MeterType;
  allReadings: ExtractedReading[]; averageConfidence: number;
}

const normConf = (c: number) => Math.max(0, Math.min(1, c / 100));
const NUM_RE   = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

function extractReadings(lines: Line[]): ExtractionResult {
  const readings: ExtractedReading[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const labelMatch = text.match(/\b(export|import|solar|gen|grid|unit|total)\b/i);
    const numMatches = text.match(NUM_RE);
    if (!numMatches) continue;
    for (const numStr of numMatches) {
      const value = parseNumericString(numStr);
      if (value === null || value < 0) continue;
      const matchingWord = line.words.find((w: Word) => w.text.includes(numStr));
      readings.push({
        value, label: labelMatch?.[1].toLowerCase(),
        confidence: normConf(matchingWord?.confidence ?? line.confidence),
        rawText: text,
      });
    }
  }
  if (readings.length === 0) {
    return { bestReading: null, rawText: '', meterType: 'unknown', allReadings: [], averageConfidence: 0 };
  }
  const best = readings.reduce((a, b) => a.confidence > b.confidence ? a : b);
  const rawText = readings.map(r => `${r.label ?? 'reading'}:${r.value}`).join(' | ');
  const averageConfidence = readings.reduce((s, r) => s + r.confidence, 0) / readings.length;
  return { bestReading: best.value, rawText, meterType: detectMeterType(rawText), allReadings: readings, averageConfidence };
}

// ====================== SANITY ======================
function passesSanity(reading: number, meterType: MeterType, prev?: number): boolean {
  if (reading < 0 || reading > OCR_CONFIG.ABSOLUTE_MAX_KWH) {
    getLogger().debug({ reading, meterType }, 'Reading out of absolute bounds'); return false;
  }
  const generative = meterType === 'solar_generation' || meterType === 'generator';
  if (prev !== undefined) {
    const delta = reading - prev;
    if (generative && delta < 0) { getLogger().debug({ reading, prev, delta }, 'Negative delta on generative meter'); return false; }
    if (Math.abs(delta) > OCR_CONFIG.SANITY_DELTA_MAX_KWH) { getLogger().debug({ reading, prev, delta }, 'Delta exceeds max allowed'); return false; }
  }
  return true;
}

// ====================== PUBLIC TYPES ======================
export interface MeterOcrResult {
  kwh: number | null;
  confidence: number;
  rawText: string;
  meterType: MeterType;
  status: 'accepted' | 'review' | 'failed' | 'manual_required';
  source: 'tesseract' | 'claude_vision' | 'tesseract_with_warning';
  allReadings?: ExtractedReading[];
  error?: string;
}

// ====================== CLAUDE VISION — SPECIALIZED METER PROMPT ======================
/**
 * Claude is prompted as a meter-reading specialist, not a general vision model.
 *
 * Key prompt engineering decisions:
 * - Tells Claude exactly what kind of display it is looking at
 * - Lists common formats it will see on Zambian ZESCO meters
 * - Instructs it to read left-to-right and ignore decorative digits
 * - Asks for ONLY the number — no explanation, no units
 * - If uncertain, return UNREADABLE (never guess)
 *
 * Claude results ALWAYS return status:'review' regardless of confidence.
 * The human user must confirm before the reading is saved to the database.
 * This is intentional — Claude is a fallback, not a trusted oracle.
 */
const CLAUDE_METER_PROMPT = `You are a specialized electricity meter reading system.

The image shows a physical electricity meter — either an LCD display, a mechanical counter (roller digits), or a 7-segment LED display.

Your task: Read the main cumulative kilowatt-hour (kWh) consumption value.

Rules:
1. The reading is a sequence of digits, typically 5-7 digits with 1-2 decimal places
2. Common formats: 00152.61, 0152.6, 152.61, 8430.6, 08430
3. Read digits LEFT TO RIGHT
4. If there are red digits after the decimal point, include them
5. If there are multiple numbers, choose the LARGEST one — it is the total cumulative reading
6. Do NOT include units (kWh, W, etc.)
7. Do NOT include any explanation or text
8. Return ONLY the number, e.g.: 152.61

If the meter display is unclear, covered, blurry, or you cannot read it with certainty:
Return the single word: UNREADABLE

Do not guess. Do not round. Return the exact digits you see.`;

async function callClaudeVision(imageUrl: string, logger: pino.Logger): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  // Download image first — Telegram CDN is blocked by Claude's URL fetcher
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), OCR_CONFIG.REQUEST_TIMEOUT_MS);
  let base64: string;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    base64 = Buffer.from(buffer).toString('base64');
    const raw = res.headers.get('content-type') ?? '';
    if (raw.includes('png'))       mediaType = 'image/png';
    else if (raw.includes('webp')) mediaType = 'image/webp';
    else if (raw.includes('gif'))  mediaType = 'image/gif';
    else                           mediaType = 'image/jpeg';
  } finally {
    clearTimeout(timeoutId);
  }

  const anthropic = new Anthropic({ apiKey: key, timeout: OCR_CONFIG.REQUEST_TIMEOUT_MS });

  const message = await anthropic.messages.create({
    model:      OCR_CONFIG.CLAUDE_MODEL,
    max_tokens: 32,
    messages:   [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text',  text: CLAUDE_METER_PROMPT },
      ],
    }],
  });

  const vlText = message.content.find(b => b.type === 'text')?.text.trim() ?? '';
  if (!vlText || vlText === 'UNREADABLE') throw new Error('Claude returned UNREADABLE');
  return vlText;
}

// ====================== MAIN FUNCTION ======================
export async function readMeterOCR(
  imageUrl: string,
  options: {
    prevReading?: number;
    confidenceThreshold?: number;
    enableVLFallback?: boolean;
    requestId?: string;
  } = {}
): Promise<MeterOcrResult> {
  const threshold      = options.confidenceThreshold ?? OCR_CONFIG.CONFIDENCE_THRESHOLD;
  const enableFallback = options.enableVLFallback ?? true;
  const logger = getLogger().child({ requestId: options.requestId, imageUrl: imageUrl.substring(0, 100) });

  try { validateImageUrl(imageUrl); } catch (err) {
    return { kwh: null, confidence: 0, rawText: '', meterType: 'unknown', status: 'failed', source: 'tesseract_with_warning', error: 'Invalid image URL' };
  }

  const cacheKey = await cacheKeyFor(imageUrl);
  const cached   = await cacheGet(cacheKey);
  if (cached) {
    logger.debug({ cacheKey, status: cached.status }, 'Cache hit');
    ocrRequestsTotal.inc({ status: cached.status, source: cached.source, cache: 'hit' });
    return cached;
  }

  const endTimer = ocrDurationSeconds.startTimer();
  let result!: MeterOcrResult;

  try {
    result = await _runOCR(imageUrl, threshold, enableFallback, options.prevReading, logger);
  } catch (err) {
    logger.error({ err }, 'OCR pipeline unexpected error');
    result = { kwh: null, confidence: 0, rawText: '', meterType: 'unknown', status: 'failed', source: 'tesseract_with_warning', error: err instanceof Error ? err.message : String(err) };
  } finally {
    endTimer({ status: result.status, source: result.source });
  }

  ocrRequestsTotal.inc({ status: result.status, source: result.source, cache: 'miss' });
  // Only cache successful reads, not failures or manual_required
  if (result.status === 'accepted' || result.status === 'review') {
    await cacheSet(cacheKey, result);
  }

  logger.info({ status: result.status, source: result.source, kwh: result.kwh, confidence: result.confidence }, 'OCR completed');
  return result;
}

async function _runOCR(
  imageUrl: string,
  threshold: number,
  enableFallback: boolean,
  prevReading: number | undefined,
  logger: pino.Logger,
): Promise<MeterOcrResult> {

  // ── Stage 1: Tesseract with meter-optimized preprocessing ─────────────────
  let tResult: ExtractionResult | null = null;
  let tError: string | undefined;

  try {
    const raw         = await fetchImageBuffer(imageUrl, OCR_CONFIG.REQUEST_TIMEOUT_MS);
    const preprocessed = await preprocessImage(raw);
    const scheduler   = await getScheduler();
    const { data }    = await scheduler.addJob('recognize', preprocessed);
    tResult           = extractReadings((data as any).lines ?? []);
  } catch (err) {
    logger.warn({ err }, 'Tesseract OCR failed');
    tError = err instanceof Error ? err.message : String(err);
  }

  if (tResult?.bestReading !== null && tResult != null) {
    const { bestReading, averageConfidence, rawText, meterType, allReadings } = tResult;
    const passes = passesSanity(bestReading, meterType, prevReading);

    if (averageConfidence >= threshold && passes) {
      // High confidence Tesseract result — auto-accept
      return { kwh: bestReading, confidence: averageConfidence, rawText, meterType, status: 'accepted', source: 'tesseract', allReadings };
    }
    if (!enableFallback) {
      // Low confidence but no fallback — ask user to confirm
      return { kwh: bestReading, confidence: averageConfidence, rawText, meterType, status: 'review', source: 'tesseract_with_warning', allReadings };
    }
  } else if (!enableFallback) {
    return { kwh: null, confidence: 0, rawText: '', meterType: 'unknown', status: 'failed', source: 'tesseract_with_warning', error: tError ?? 'No readings detected' };
  }

  // ── Stage 2: Claude Haiku (specialized meter prompt) ─────────────────────
  try {
    const vlText   = await callClaudeVision(imageUrl, logger);
    const numMatch = vlText.match(NUM_RE);
    const kwh      = numMatch ? parseNumericString(numMatch[0]) : null;
    if (kwh === null) throw new Error(`Unparseable Claude response: "${vlText}"`);

    const meterType = detectMeterType(vlText + ' ' + (tResult?.rawText ?? ''));
    // passesSanity is checked but doesn't affect status — always 'review'
    passesSanity(kwh, meterType, prevReading);

    // INTENTIONAL: Claude results always return 'review'.
    // The user must confirm the reading before it is saved.
    // This prevents wrong readings from silently entering the database.
    return {
      kwh,
      confidence: OCR_CONFIG.FALLBACK_CONFIDENCE,
      rawText: vlText,
      meterType,
      status: 'review',   // ← always review for Claude
      source: 'claude_vision',
      allReadings: tResult?.allReadings,
    };

  } catch (err: any) {
    logger.warn({ err }, 'Claude fallback failed');

    // Detect credit exhaustion / quota errors
    const isQuotaError = err?.status === 429 || err?.status === 529 ||
      (err?.message ?? '').toLowerCase().includes('credit') ||
      (err?.message ?? '').toLowerCase().includes('quota') ||
      (err?.message ?? '').toLowerCase().includes('overloaded');

    if (isQuotaError) {
      logger.warn('Claude API credits exhausted — requesting manual entry');
      // Return manual_required status — bot will prompt user to type the reading
      return {
        kwh: null,
        confidence: 0,
        rawText: '',
        meterType: 'unknown',
        status: 'manual_required',
        source: 'tesseract_with_warning',
        error: 'OCR unavailable. Please enter reading manually.',
      };
    }

    // Other Claude errors — degrade to Tesseract result if available
    if (tResult?.bestReading !== null && tResult != null) {
      return {
        kwh: tResult.bestReading,
        confidence: tResult.averageConfidence * 0.75,
        rawText: tResult.rawText,
        meterType: tResult.meterType,
        status: 'review',
        source: 'tesseract_with_warning',
        allReadings: tResult.allReadings,
        error: `Claude fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return {
      kwh: null,
      confidence: 0,
      rawText: '',
      meterType: 'unknown',
      status: 'manual_required',
      source: 'tesseract_with_warning',
      error: `Both OCR engines failed. Please type your reading with /read <value>`,
    };
  }
}

// ====================== LIFECYCLE ======================
export async function cleanupOCR(): Promise<void> {
  getLogger().info('Cleaning up OCR resources...');
  if (_scheduler) { await _scheduler.terminate(); _scheduler = null; getLogger().info('Tesseract scheduler terminated'); }
  _redis = null; // REST client — no connection to close
}

export async function checkOCRHealth(): Promise<{ tesseract: boolean; redis: boolean; claude: boolean }> {
  return {
    tesseract: _scheduler !== null,
    redis:     !_redisDisabled && getRedis() !== null,
    claude:    !!process.env.ANTHROPIC_API_KEY,
  };
}

export function registerOCRShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    getLogger().info({ signal }, 'Received shutdown signal');
    await cleanupOCR();
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}