// enerlectra-core/src/core/services/ocr.types.ts
// Thin re-export module so handlers can import MeterType without pulling in
// the full ocr.ts implementation (which has heavy runtime deps like tesseract.js/sharp).
export type { MeterType, MeterOcrResult } from './ocr.js';
