/**
 * Reconcile physical readings against ownership shares.
 * Returns allocation of energy credits per user.
 */
interface Reading {
    clusterId: string;
    unitId: string;
    userId: string;
    readingKwh: number;
    meterType: string;
    reportingPeriod: string;
    source?: string;
}
interface Ownership {
    userId: string;
    ownershipPct: number;
}
interface ReconciliationInput {
    readings: Reading[];
    ownership: Ownership[];
    clusterId: string;
    period: string;
}
interface AllocationResult {
    clusterId: string;
    period: string;
    userId: string;
    allocatedKwh: number;
    ownershipPct: number;
    totalGenerationKwh: number;
    totalConsumptionKwh: number;
}
export declare function reconcileEnergyAllocation({ readings, ownership, clusterId, period, }: ReconciliationInput): {
    clusterId: string;
    period: string;
    allocations: AllocationResult[];
    summary: {
        totalGenerationKwh: number;
        totalConsumptionKwh: number;
        totalAllocatedKwh: number;
    };
};
export {};
