import { MeterReading, ReconciliationResult } from '../types/energy';
interface ReconciliationInput {
    readings: MeterReading[];
    ownership: Array<{
        userId: string;
        ownershipPct: number;
    }>;
    clusterId: string;
    period: string;
    gridRate?: number;
    solarRate?: number;
}
/**
 * The Brain of Enerlectra:
 * Reconciles physical meter data against financial ownership snapshots.
 * Determines how much solar credit an investor gets vs how much grid debt a user owes.
 */
export declare function reconcileEnergyAllocation(input: ReconciliationInput): ReconciliationResult;
export {};

