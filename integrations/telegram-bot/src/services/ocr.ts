import { createScheduler, createWorker, OEM, PSM } from 'tesseract.js';
import type { Line, Scheduler, Word } from 'tesseract.js';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { Counter, Histogram, Registry } from 'prom-client';
import { createHash } from 'node:crypto';
import pino from 'pino';
import { URL } from 'node:url';

let _logger: pino.Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
});

export function setLogger(logger: pino.Logger): void {
  _logger = logger;
}

function getLogger(): pino.Logger {
  return _logger;
}

const OCR_CONFIG = {
  CONFIDENCE_THRESHOLD: 0.82,
  FALLBACK_CONFIDENCE: 0.85,
  SANITY_DELTA_MAX_KWH: 500,
  ABSOLUTE_MAX_KWH: 999_999,
  SUSPICIOUS_MAX_KWH: 10_000,
  CLAUDE_MODEL: 'claude-haiku-4-5-20251001' as const,
  WORKER_COUNT: parseInt(process.env.TESSERACT_WORKERS ?? '1', 10),
  CACHE_TTL: parseInt(process.env.REDIS_CACHE_TTL ?? '3600', 10),
  REQUEST_TIMEOUT_MS: parseInt(process.env.OCR_REQUEST_TIMEOUT_MS ?? '15000', 10),
  MAX_IMAGE_BYTES: parseInt(process.env.MAX_IMAGE_BYTES ?? `${10 * 1024 * 1024}`, 10),
  CACHE_VERSION: 'v2',
} as const;

let _scheduler: Scheduler | null = null;
let _schedulerInit: Promise<Scheduler> | null = null;
let _schedulerCreatedAt = 0;
const WORKER_MAX_AGE_MS = 30 * 60 * 1000;

async function buildScheduler(): Promise<Scheduler> {
  const scheduler = createScheduler();
  const workers = await Promise.all(
    Array.from({ length: OCR_CONFIG.WORKER_COUNT }, async (_, idx) => {
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        logger: (m) => {
          if (m.status === 'error') {
            getLogger().warn({ workerId: idx, ...m }, 'Tesseract worker error');
          }
        },
      });

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: '0123456789., ',
      });

      return worker;
    })
  );

  workers.forEach((worker) => scheduler.addWorker(worker));
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

  _schedulerInit = buildScheduler()
    .then((scheduler) => {
      _scheduler = scheduler;
      _schedulerCreatedAt = Date.now();
      _schedulerInit = null;
      return scheduler;
    })
    .catch((err) => {
      _schedulerInit = null;
      throw err;
    });

  return _schedulerInit;
}

let _redis: Redis | null = null;
let _redisDisabled = false;

function getRedis(): Redis | null {
  if (_redisDisabled) return null;
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _redisDisabled = true;
    getLogger().info('Upstash REST credentials not set - caching disabled');
    return null;
  }

  try {
    _redis = new Redis({ url, token });
    getLogger().info('Upstash Redis REST client initialized');
    return _redis;
  } catch (err) {
    getLogger().warn({ err }, 'Failed to initialize Upstash Redis - caching disabled');
    _redisDisabled = true;
    return null;
  }
}

async function cacheGet(key: string): Promise<MeterOcrResult | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get<string>(key);
    return raw ? (JSON.parse(raw) as MeterOcrResult) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: MeterOcrResult): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.setex(key, OCR_CONFIG.CACHE_TTL, JSON.stringify(value));
  } catch {
    // Cache writes are non-fatal.
  }
}

async function cacheKeyFor(imageUrl: string): Promise<string> {
  const prefix = `ocr:${OCR_CONFIG.CACHE_VERSION}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2_000);
    const res = await fetch(imageUrl, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);

    const etag = res.headers.get('etag');
    if (etag) {
      return `${prefix}:e:${createHash('sha256').update(etag).digest('hex')}`;
    }

    const lastModified = res.headers.get('last-modified');
    if (lastModified) {
      return `${prefix}:lm:${createHash('sha256').update(imageUrl + lastModified).digest('hex')}`;
    }
  } catch {
    // Fall back to URL key below.
  }

  return `${prefix}:url:${createHash('sha256').update(imageUrl).digest('hex')}`;
}

export const ocrRegistry = new Registry();

const ocrRequestsTotal = new Counter({
  name: 'ocr_requests_total',
  help: 'Total OCR requests',
  labelNames: ['status', 'source', 'cache'] as const,
  registers: [ocrRegistry],
});

const ocrDurationSeconds = new Histogram({
  name: 'ocr_duration_seconds',
  help: 'OCR latency',
  labelNames: ['status', 'source'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
  registers: [ocrRegistry],
});

export async function getOCRMetrics(): Promise<string> {
  return ocrRegistry.metrics();
}

function validateImageUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid image URL');
  }
}

async function fetchImageBuffer(imageUrl: string, timeoutMs: number): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);

    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > OCR_CONFIG.MAX_IMAGE_BYTES) {
      throw new Error(`Image too large: ${contentLength} bytes`);
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > OCR_CONFIG.MAX_IMAGE_BYTES) {
      throw new Error('Image too large after fetch');
    }

    return new Uint8Array(buffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function preprocessImage(buffer: Uint8Array): Promise<Buffer> {
  return sharp(Buffer.from(buffer))
    .greyscale()
    .normalize()
    .linear(1.8, -(128 * 0.8))
    .sharpen({ sigma: 2.0, m1: 0, m2: 3, x1: 2, y2: 10, y3: 20 })
    .png()
    .toBuffer();
}

export function parseNumericString(raw: string): number | null {
  const separators: Array<{ char: string; digitsBefore: number; digitsAfter: number }> = [];

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === ',' || raw[i] === '.') {
      separators.push({
        char: raw[i],
        digitsBefore: raw.slice(0, i).replace(/\D/g, '').length,
        digitsAfter: (raw.slice(i + 1).match(/^\d+/) ?? [''])[0].length,
      });
    }
  }

  if (separators.length === 0) {
    const value = parseFloat(raw);
    return Number.isNaN(value) ? null : value;
  }

  const chars = new Set(separators.map((separator) => separator.char));
  if (chars.size > 1) {
    const decimalChar = separators[separators.length - 1].char;
    const thousandsChar = decimalChar === '.' ? ',' : '.';
    let out = '';

    for (const char of raw) {
      out += char === thousandsChar ? '' : char === decimalChar ? '.' : char;
    }

    const value = parseFloat(out);
    return Number.isNaN(value) ? null : value;
  }

  if (separators.length > 1) {
    const separator = separators[0].char;
    let out = '';

    for (const char of raw) {
      if (char !== separator) out += char;
    }

    const value = parseFloat(out);
    return Number.isNaN(value) ? null : value;
  }

  const separator = separators[0];
  const normalized =
    separator.digitsAfter === 3 && separator.digitsBefore <= 3
      ? raw.replace(separator.char, '')
      : raw.replace(separator.char, '.');

  const value = parseFloat(normalized);
  return Number.isNaN(value) ? null : value;
}

export type MeterType =
  | 'grid_import'
  | 'solar_import'
  | 'solar_export'
  | 'solar_generation'
  | 'unit_submeter'
  | 'generator'
  | 'unknown';

type ClaudeMeterType = Extract<MeterType, 'grid_import' | 'solar_export' | 'unknown'>;

export function detectMeterType(text: string): MeterType {
  const lower = text.toLowerCase();
  const scores: Record<MeterType, number> = {
    grid_import: 0,
    solar_import: 0,
    solar_export: 0,
    solar_generation: 0,
    unit_submeter: 0,
    generator: 0,
    unknown: 0,
  };

  if (lower.includes('export')) scores.solar_export += 3;
  if (lower.includes('import')) scores.grid_import += 2;
  if (lower.includes('grid')) scores.grid_import += 3;
  if (lower.includes('solar') || lower.includes('pv')) {
    scores.solar_generation += 2;
    scores.solar_export += 1;
  }
  if (lower.includes('unit') || lower.includes('sub')) scores.unit_submeter += 3;
  if (/\bgen\b/.test(lower)) scores.generator += 3;
  if (lower.includes('generation')) scores.solar_generation += 2;

  const best = Object.entries(scores).reduce((currentBest, candidate) =>
    currentBest[1] >= candidate[1] ? currentBest : candidate
  );

  return (best[1] > 0 ? best[0] : 'unknown') as MeterType;
}

export interface ExtractedReading {
  value: number;
  label?: string;
  confidence: number;
  rawText: string;
}

interface ExtractionResult {
  bestReading: number | null;
  rawText: string;
  meterType: MeterType;
  allReadings: ExtractedReading[];
  averageConfidence: number;
}

interface ClaudeVisionResult {
  kwh: number;
  meterType: ClaudeMeterType;
  rawText: string;
}

const normConf = (confidence: number) => Math.max(0, Math.min(1, confidence / 100));
const NUM_RE = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

function extractReadings(lines: Line[]): ExtractionResult {
  const readings: ExtractedReading[] = [];

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    const labelMatch = text.match(/\b(export|import|solar|gen|grid|unit|total)\b/i);
    const numberMatches = text.match(NUM_RE);
    if (!numberMatches) continue;

    for (const numberString of numberMatches) {
      const value = parseNumericString(numberString);
      if (value === null || value < 0) continue;

      const matchingWord = line.words.find((word: Word) => word.text.includes(numberString));
      readings.push({
        value,
        label: labelMatch?.[1].toLowerCase(),
        confidence: normConf(matchingWord?.confidence ?? line.confidence),
        rawText: text,
      });
    }
  }

  if (readings.length === 0) {
    return {
      bestReading: null,
      rawText: '',
      meterType: 'unknown',
      allReadings: [],
      averageConfidence: 0,
    };
  }

  const best = readings.reduce((currentBest, candidate) =>
    currentBest.confidence > candidate.confidence ? currentBest : candidate
  );
  const rawText = readings.map((reading) => `${reading.label ?? 'reading'}:${reading.value}`).join(' | ');
  const averageConfidence =
    readings.reduce((sum, reading) => sum + reading.confidence, 0) / readings.length;

  return {
    bestReading: best.value,
    rawText,
    meterType: detectMeterType(rawText),
    allReadings: readings,
    averageConfidence,
  };
}

function passesSanity(reading: number, meterType: MeterType, prev?: number): boolean {
  if (reading < 0 || reading > OCR_CONFIG.ABSOLUTE_MAX_KWH) {
    getLogger().debug({ reading, meterType }, 'Reading out of absolute bounds');
    return false;
  }

  const generative = meterType === 'solar_generation' || meterType === 'generator';
  if (prev !== undefined) {
    const delta = reading - prev;
    if (generative && delta < 0) {
      getLogger().debug({ reading, prev, delta }, 'Negative delta on generative meter');
      return false;
    }
    if (Math.abs(delta) > OCR_CONFIG.SANITY_DELTA_MAX_KWH) {
      getLogger().debug({ reading, prev, delta }, 'Delta exceeds max allowed');
      return false;
    }
  }

  return true;
}

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

const CLAUDE_METER_PROMPT = `You are a specialized electricity meter reading system.

The image shows a physical electricity meter or inverter display.

Your tasks:
1. Read the main cumulative kilowatt-hour value.
2. Classify the meter type from visual cues.

CRITICAL DECIMAL HANDLING:
- The display may show a decimal point (e.g., 36.38 or 152.61).
- You MUST preserve the decimal point exactly as shown.
- If the display shows "36.38", return "36.38" — NOT "3638".
- If the display shows "36,38", return "36.38" (convert comma to dot).
- If you are unsure whether a dot is a decimal or just dirt on the display, assume it is a decimal point for values under 1000 kWh.

Allowed meter types:
- grid_import
- solar_export
- unknown

Classification hints:
- Use grid_import if you see grid meter branding, utility branding, a prepaid token slot, or labels such as IMPORT.
- Use solar_export if you see inverter or solar branding, PV labels, solar flow indicators, or export-style generation displays.
- Use unknown if the display type is unclear.

Output rules:
- Return exactly one line.
- Use this exact format: NUMBER|TYPE
- Examples: 152.61|grid_import, 36.38|grid_import, 282|solar_export, 8430.6|unknown
- Do not include units or any extra words.
- If the reading is unclear or unreadable, return exactly: UNREADABLE|unknown`;

function parseClaudeMeterType(rawType: string): ClaudeMeterType | null {
  if (rawType === 'grid_import' || rawType === 'solar_export' || rawType === 'unknown') {
    return rawType;
  }
  return null;
}

function parseClaudeVisionResponse(rawText: string): ClaudeVisionResult {
  const normalized = rawText.trim();
  if (!normalized) {
    throw new Error('Claude returned an empty response');
  }

  if (/^UNREADABLE(?:\|unknown)?$/i.test(normalized)) {
    throw new Error('Claude returned UNREADABLE');
  }

  const parts = normalized.split('|').map((part) => part.trim());
  if (parts.length !== 2) {
    throw new Error(`Malformed Claude response: "${rawText}"`);
  }

  const [valuePart, typePart] = parts;
  const kwh = parseNumericString(valuePart);
  if (kwh === null) {
    throw new Error(`Unparseable Claude reading: "${rawText}"`);
  }

  const meterType = parseClaudeMeterType(typePart);
  if (!meterType) {
    throw new Error(`Unsupported Claude meter type: "${typePart}"`);
  }

  return { kwh, meterType, rawText: normalized };
}

async function callClaudeVision(imageUrl: string, logger: pino.Logger): Promise<ClaudeVisionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_CONFIG.REQUEST_TIMEOUT_MS);

  let base64: string;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);

    const buffer = await res.arrayBuffer();
    base64 = Buffer.from(buffer).toString('base64');

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('png')) mediaType = 'image/png';
    else if (contentType.includes('webp')) mediaType = 'image/webp';
    else if (contentType.includes('gif')) mediaType = 'image/gif';
    else mediaType = 'image/jpeg';
  } finally {
    clearTimeout(timeoutId);
  }

  const anthropic = new Anthropic({ apiKey, timeout: OCR_CONFIG.REQUEST_TIMEOUT_MS });
  const message = await anthropic.messages.create({
    model: OCR_CONFIG.CLAUDE_MODEL,
    max_tokens: 32,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: CLAUDE_METER_PROMPT,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : '';
  const parsed = parseClaudeVisionResponse(rawText);

  if (parsed.kwh > OCR_CONFIG.SUSPICIOUS_MAX_KWH) {
    logger.warn(
      { kwh: parsed.kwh, rawText: parsed.rawText },
      'Claude returned suspiciously large reading — possible decimal point missed'
    );
    throw new Error(`Suspicious reading ${parsed.kwh} — decimal point likely missed. Please retake photo with better focus or enter manually.`);
  }

  logger.debug({ rawText: parsed.rawText, meterType: parsed.meterType }, 'Claude vision parsed response');
  return parsed;
}

export async function readMeterOCR(
  imageUrl: string,
  options: {
    prevReading?: number;
    confidenceThreshold?: number;
    enableVLFallback?: boolean;
    requestId?: string;
  } = {}
): Promise<MeterOcrResult> {
  const threshold = options.confidenceThreshold ?? OCR_CONFIG.CONFIDENCE_THRESHOLD;
  const enableFallback = options.enableVLFallback ?? true;
  const logger = getLogger().child({
    requestId: options.requestId,
    imageUrl: imageUrl.substring(0, 100),
  });

  try {
    validateImageUrl(imageUrl);
  } catch {
    return {
      kwh: null,
      confidence: 0,
      rawText: '',
      meterType: 'unknown',
      status: 'failed',
      source: 'tesseract_with_warning',
      error: 'Invalid image URL',
    };
  }

  const cacheKey = await cacheKeyFor(imageUrl);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    logger.debug({ cacheKey, status: cached.status }, 'Cache hit');
    ocrRequestsTotal.inc({ status: cached.status, source: cached.source, cache: 'hit' });
    return cached;
  }

  const stopTimer = ocrDurationSeconds.startTimer();
  let result!: MeterOcrResult;

  try {
    result = await runOCR(imageUrl, threshold, enableFallback, options.prevReading, logger);
  } catch (err) {
    logger.error({ err }, 'OCR pipeline unexpected error');
    result = {
      kwh: null,
      confidence: 0,
      rawText: '',
      meterType: 'unknown',
      status: 'failed',
      source: 'tesseract_with_warning',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    stopTimer({ status: result.status, source: result.source });
  }

  ocrRequestsTotal.inc({ status: result.status, source: result.source, cache: 'miss' });
  if (result.status === 'accepted' || result.status === 'review') {
    await cacheSet(cacheKey, result);
  }

  logger.info(
    {
      status: result.status,
      source: result.source,
      kwh: result.kwh,
      confidence: result.confidence,
      meterType: result.meterType,
    },
    'OCR completed'
  );

  return result;
}

async function runOCR(
  imageUrl: string,
  threshold: number,
  enableFallback: boolean,
  prevReading: number | undefined,
  logger: pino.Logger
): Promise<MeterOcrResult> {
  let tesseractResult: ExtractionResult | null = null;
  let tesseractError: string | undefined;

  try {
    const raw = await fetchImageBuffer(imageUrl, OCR_CONFIG.REQUEST_TIMEOUT_MS);
    const preprocessed = await preprocessImage(raw);
    const scheduler = await getScheduler();
    const { data } = await scheduler.addJob('recognize', preprocessed);
    tesseractResult = extractReadings((data as any).lines ?? []);
  } catch (err) {
    logger.warn({ err }, 'Tesseract OCR failed');
    tesseractError = err instanceof Error ? err.message : String(err);
  }

  if (tesseractResult?.bestReading !== null && tesseractResult != null) {
    const {
      bestReading,
      averageConfidence,
      rawText,
      meterType,
      allReadings,
    } = tesseractResult;
    const passes = passesSanity(bestReading, meterType, prevReading);

    if (averageConfidence >= threshold && passes) {
      return {
        kwh: bestReading,
        confidence: averageConfidence,
        rawText,
        meterType,
        status: 'accepted',
        source: 'tesseract',
        allReadings,
      };
    }

    if (!enableFallback) {
      return {
        kwh: bestReading,
        confidence: averageConfidence,
        rawText,
        meterType,
        status: 'review',
        source: 'tesseract_with_warning',
        allReadings,
      };
    }
  } else if (!enableFallback) {
    return {
      kwh: null,
      confidence: 0,
      rawText: '',
      meterType: 'unknown',
      status: 'failed',
      source: 'tesseract_with_warning',
      error: tesseractError ?? 'No readings detected',
    };
  }

  try {
    const claudeResult = await callClaudeVision(imageUrl, logger);
    passesSanity(claudeResult.kwh, claudeResult.meterType, prevReading);

    return {
      kwh: claudeResult.kwh,
      confidence: OCR_CONFIG.FALLBACK_CONFIDENCE,
      rawText: claudeResult.rawText,
      meterType: claudeResult.meterType,
      status: 'review',
      source: 'claude_vision',
      allReadings: tesseractResult?.allReadings,
    };
  } catch (err: any) {
    logger.warn({ err }, 'Claude fallback failed');

    const message = (err?.message ?? '').toLowerCase();
    const isQuotaError =
      err?.status === 429 ||
      err?.status === 529 ||
      message.includes('credit') ||
      message.includes('quota') ||
      message.includes('overloaded');

    if (isQuotaError) {
      logger.warn('Claude API credits exhausted - requesting manual entry');
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

    if (tesseractResult?.bestReading !== null && tesseractResult != null) {
      return {
        kwh: tesseractResult.bestReading,
        confidence: tesseractResult.averageConfidence * 0.75,
        rawText: tesseractResult.rawText,
        meterType: tesseractResult.meterType,
        status: 'review',
        source: 'tesseract_with_warning',
        allReadings: tesseractResult.allReadings,
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
      error: 'Both OCR engines failed. Please type your reading with /read <value>',
    };
  }
}

export async function cleanupOCR(): Promise<void> {
  getLogger().info('Cleaning up OCR resources...');

  if (_scheduler) {
    await _scheduler.terminate();
    _scheduler = null;
    getLogger().info('Tesseract scheduler terminated');
  }

  _redis = null;
}

export async function checkOCRHealth(): Promise<{
  tesseract: boolean;
  redis: boolean;
  claude: boolean;
}> {
  return {
    tesseract: _scheduler !== null,
    redis: !_redisDisabled && getRedis() !== null,
    claude: !!process.env.ANTHROPIC_API_KEY,
  };
}

export function registerOCRShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    getLogger().info({ signal }, 'Received shutdown signal');
    await cleanupOCR();
    process.exit(0);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

