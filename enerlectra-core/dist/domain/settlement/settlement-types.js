/**
 * Settlement Types (Production-Grade)
 * BigInt-based monetary and energy primitives
 * Type-safe to prevent unit confusion
 */
// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS (Type-safe constructors)
// ═══════════════════════════════════════════════════════════════
export function ngwee(value) {
    return BigInt(value);
}
export function wattHours(value) {
    return BigInt(value);
}
/**
 * Convert ZMW to Ngwee
 * 1 ZMW = 100 Ngwee
 */
export function zmwToNgwee(zmw) {
    // Multiply by 100, round to handle floating point
    return ngwee(Math.round(zmw * 100));
}
/**
 * Convert Ngwee to ZMW (for display)
 */
export function ngweeToZmw(value) {
    return Number(value) / 100;
}
/**
 * Convert kWh to Watt-Hours
 * 1 kWh = 1000 Wh
 */
export function kwhToWh(kwh) {
    // Multiply by 1000, round to handle floating point
    return wattHours(Math.round(kwh * 1000));
}
/**
 * Convert Watt-Hours to kWh (for display)
 */
export function whToKwh(value) {
    return Number(value) / 1000;
}
// ═══════════════════════════════════════════════════════════════
// ARITHMETIC OPERATIONS (Type-safe)
// ═══════════════════════════════════════════════════════════════
export function addNgwee(a, b) {
    return (a + b);
}
export function subtractNgwee(a, b) {
    return (a - b);
}
export function multiplyNgwee(a, factor) {
    return (a * factor);
}
export function divideNgwee(a, divisor) {
    return (a / divisor);
}
export function addWh(a, b) {
    return (a + b);
}
export function subtractWh(a, b) {
    return (a - b);
}
export function multiplyWh(a, factor) {
    return (a * factor);
}
export function divideWh(a, divisor) {
    return (a / divisor);
}
// ═══════════════════════════════════════════════════════════════
// COMPARISON OPERATIONS
// ═══════════════════════════════════════════════════════════════
export function ngweeEquals(a, b) {
    return a === b;
}
export function ngweeGreaterThan(a, b) {
    return a > b;
}
export function ngweeLessThan(a, b) {
    return a < b;
}
export function whEquals(a, b) {
    return a === b;
}
export function whGreaterThan(a, b) {
    return a > b;
}
export function whLessThan(a, b) {
    return a < b;
}
// ═══════════════════════════════════════════════════════════════
// ZERO CONSTANTS
// ═══════════════════════════════════════════════════════════════
export const ZERO_NGWEE = ngwee(0n);
export const ZERO_WH = wattHours(0n);
// ═══════════════════════════════════════════════════════════════
// FORMATTING (For display only)
// ═══════════════════════════════════════════════════════════════
export function formatNgwee(value) {
    const zmw = ngweeToZmw(value);
    return `${zmw.toFixed(2)} ZMW`;
}
export function formatWh(value) {
    const kwh = whToKwh(value);
    return `${kwh.toFixed(3)} kWh`;
}
// ═══════════════════════════════════════════════════════════════
// SERIALIZATION (For database and hashing)
// ═══════════════════════════════════════════════════════════════
export function serializeNgwee(value) {
    return value.toString();
}
export function deserializeNgwee(value) {
    return ngwee(BigInt(value));
}
export function serializeWh(value) {
    return value.toString();
}
export function deserializeWh(value) {
    return wattHours(BigInt(value));
}
// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════
export function isValidNgwee(value) {
    return value >= 0n;
}
export function isValidWh(value) {
    return value >= 0n;
}
/**
 * Assert non-negative (throw if negative)
 */
export function assertNonNegativeNgwee(value, context) {
    if (value < 0n) {
        throw new Error(`Negative ngwee not allowed in ${context}: ${value}`);
    }
}
export function assertNonNegativeWh(value, context) {
    if (value < 0n) {
        throw new Error(`Negative watt-hours not allowed in ${context}: ${value}`);
    }
}
