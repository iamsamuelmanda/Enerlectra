/**
 * Settlement Types (Production-Grade)
 * BigInt-based monetary and energy primitives
 * Type-safe to prevent unit confusion
 */

// ═══════════════════════════════════════════════════════════════
// BRANDED TYPES (Prevent unit confusion at compile time)
// ═══════════════════════════════════════════════════════════════

type Brand<K, T> = K & { __brand: T };

/**
 * Ngwee - Minor unit of ZMW currency
 * 1 ZMW = 100 Ngwee
 * ALWAYS stored as BigInt
 */
export type Ngwee = Brand<bigint, 'Ngwee'>;

/**
 * WattHours - Energy unit
 * 1 kWh = 1000 Wh
 * ALWAYS stored as BigInt
 */
export type WattHours = Brand<bigint, 'WattHours'>;

// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS (Type-safe constructors)
// ═══════════════════════════════════════════════════════════════

export function ngwee(value: bigint | number | string): Ngwee {
  return BigInt(value) as Ngwee;
}

export function wattHours(value: bigint | number | string): WattHours {
  return BigInt(value) as WattHours;
}

/**
 * Convert ZMW to Ngwee
 * 1 ZMW = 100 Ngwee
 */
export function zmwToNgwee(zmw: number): Ngwee {
  // Multiply by 100, round to handle floating point
  return ngwee(Math.round(zmw * 100));
}

/**
 * Convert Ngwee to ZMW (for display)
 */
export function ngweeToZmw(value: Ngwee): number {
  return Number(value) / 100;
}

/**
 * Convert kWh to Watt-Hours
 * 1 kWh = 1000 Wh
 */
export function kwhToWh(kwh: number): WattHours {
  // Multiply by 1000, round to handle floating point
  return wattHours(Math.round(kwh * 1000));
}

/**
 * Convert Watt-Hours to kWh (for display)
 */
export function whToKwh(value: WattHours): number {
  return Number(value) / 1000;
}

// ═══════════════════════════════════════════════════════════════
// ARITHMETIC OPERATIONS (Type-safe)
// ═══════════════════════════════════════════════════════════════

export function addNgwee(a: Ngwee, b: Ngwee): Ngwee {
  return (a + b) as Ngwee;
}

export function subtractNgwee(a: Ngwee, b: Ngwee): Ngwee {
  return (a - b) as Ngwee;
}

export function multiplyNgwee(a: Ngwee, factor: bigint): Ngwee {
  return (a * factor) as Ngwee;
}

export function divideNgwee(a: Ngwee, divisor: bigint): Ngwee {
  return (a / divisor) as Ngwee;
}

export function addWh(a: WattHours, b: WattHours): WattHours {
  return (a + b) as WattHours;
}

export function subtractWh(a: WattHours, b: WattHours): WattHours {
  return (a - b) as WattHours;
}

export function multiplyWh(a: WattHours, factor: bigint): WattHours {
  return (a * factor) as WattHours;
}

export function divideWh(a: WattHours, divisor: bigint): WattHours {
  return (a / divisor) as WattHours;
}

// ═══════════════════════════════════════════════════════════════
// COMPARISON OPERATIONS
// ═══════════════════════════════════════════════════════════════

export function ngweeEquals(a: Ngwee, b: Ngwee): boolean {
  return a === b;
}

export function ngweeGreaterThan(a: Ngwee, b: Ngwee): boolean {
  return a > b;
}

export function ngweeLessThan(a: Ngwee, b: Ngwee): boolean {
  return a < b;
}

export function whEquals(a: WattHours, b: WattHours): boolean {
  return a === b;
}

export function whGreaterThan(a: WattHours, b: WattHours): boolean {
  return a > b;
}

export function whLessThan(a: WattHours, b: WattHours): boolean {
  return a < b;
}

// ═══════════════════════════════════════════════════════════════
// ZERO CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const ZERO_NGWEE: Ngwee = ngwee(0n);
export const ZERO_WH: WattHours = wattHours(0n);

// ═══════════════════════════════════════════════════════════════
// FORMATTING (For display only)
// ═══════════════════════════════════════════════════════════════

export function formatNgwee(value: Ngwee): string {
  const zmw = ngweeToZmw(value);
  return `${zmw.toFixed(2)} ZMW`;
}

export function formatWh(value: WattHours): string {
  const kwh = whToKwh(value);
  return `${kwh.toFixed(3)} kWh`;
}

// ═══════════════════════════════════════════════════════════════
// SERIALIZATION (For database and hashing)
// ═══════════════════════════════════════════════════════════════

export function serializeNgwee(value: Ngwee): string {
  return value.toString();
}

export function deserializeNgwee(value: string): Ngwee {
  return ngwee(BigInt(value));
}

export function serializeWh(value: WattHours): string {
  return value.toString();
}

export function deserializeWh(value: string): WattHours {
  return wattHours(BigInt(value));
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

export function isValidNgwee(value: Ngwee): boolean {
  return value >= 0n;
}

export function isValidWh(value: WattHours): boolean {
  return value >= 0n;
}

/**
 * Assert non-negative (throw if negative)
 */
export function assertNonNegativeNgwee(value: Ngwee, context: string): void {
  if (value < 0n) {
    throw new Error(`Negative ngwee not allowed in ${context}: ${value}`);
  }
}

export function assertNonNegativeWh(value: WattHours, context: string): void {
  if (value < 0n) {
    throw new Error(`Negative watt-hours not allowed in ${context}: ${value}`);
  }
}