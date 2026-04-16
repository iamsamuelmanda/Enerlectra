/**
 * Settlement Types (Production-Grade)
 * BigInt-based monetary and energy primitives
 * Type-safe to prevent unit confusion
 */
type Brand<K, T> = K & {
    __brand: T;
};
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
export declare function ngwee(value: bigint | number | string): Ngwee;
export declare function wattHours(value: bigint | number | string): WattHours;
/**
 * Convert ZMW to Ngwee
 * 1 ZMW = 100 Ngwee
 */
export declare function zmwToNgwee(zmw: number): Ngwee;
/**
 * Convert Ngwee to ZMW (for display)
 */
export declare function ngweeToZmw(value: Ngwee): number;
/**
 * Convert kWh to Watt-Hours
 * 1 kWh = 1000 Wh
 */
export declare function kwhToWh(kwh: number): WattHours;
/**
 * Convert Watt-Hours to kWh (for display)
 */
export declare function whToKwh(value: WattHours): number;
export declare function addNgwee(a: Ngwee, b: Ngwee): Ngwee;
export declare function subtractNgwee(a: Ngwee, b: Ngwee): Ngwee;
export declare function multiplyNgwee(a: Ngwee, factor: bigint): Ngwee;
export declare function divideNgwee(a: Ngwee, divisor: bigint): Ngwee;
export declare function addWh(a: WattHours, b: WattHours): WattHours;
export declare function subtractWh(a: WattHours, b: WattHours): WattHours;
export declare function multiplyWh(a: WattHours, factor: bigint): WattHours;
export declare function divideWh(a: WattHours, divisor: bigint): WattHours;
export declare function ngweeEquals(a: Ngwee, b: Ngwee): boolean;
export declare function ngweeGreaterThan(a: Ngwee, b: Ngwee): boolean;
export declare function ngweeLessThan(a: Ngwee, b: Ngwee): boolean;
export declare function whEquals(a: WattHours, b: WattHours): boolean;
export declare function whGreaterThan(a: WattHours, b: WattHours): boolean;
export declare function whLessThan(a: WattHours, b: WattHours): boolean;
export declare const ZERO_NGWEE: Ngwee;
export declare const ZERO_WH: WattHours;
export declare function formatNgwee(value: Ngwee): string;
export declare function formatWh(value: WattHours): string;
export declare function serializeNgwee(value: Ngwee): string;
export declare function deserializeNgwee(value: string): Ngwee;
export declare function serializeWh(value: WattHours): string;
export declare function deserializeWh(value: string): WattHours;
export declare function isValidNgwee(value: Ngwee): boolean;
export declare function isValidWh(value: WattHours): boolean;
/**
 * Assert non-negative (throw if negative)
 */
export declare function assertNonNegativeNgwee(value: Ngwee, context: string): void;
export declare function assertNonNegativeWh(value: WattHours, context: string): void;
export {};
