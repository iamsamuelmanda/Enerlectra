// enerlectra-core/src/engines/energyReconciliation.ts
/**
 * Reconcile physical readings against ownership shares.
 * Returns allocation of energy credits per user.
 */
export function reconcileEnergyAllocation({ readings, ownership, clusterId, period, }) {
    // Separate generation vs consumption
    const generation = readings.filter((r) => r.meterType === "solar_generation" || r.meterType === "solar_export");
    const consumption = readings.filter((r) => r.meterType === "grid_import" || r.meterType === "grid_consumption");
    const totalGenerationKwh = generation.reduce((sum, r) => sum + r.readingKwh, 0);
    const totalConsumptionKwh = consumption.reduce((sum, r) => sum + r.readingKwh, 0);
    // Allocate generation credits proportionally
    const allocations = ownership.map((owner) => {
        const allocatedKwh = totalGenerationKwh * owner.ownershipPct;
        return {
            clusterId,
            period,
            userId: owner.userId,
            allocatedKwh,
            ownershipPct: owner.ownershipPct,
            totalGenerationKwh,
            totalConsumptionKwh,
        };
    });
    return {
        clusterId,
        period,
        allocations,
        summary: {
            totalGenerationKwh,
            totalConsumptionKwh,
            totalAllocatedKwh: allocations.reduce((sum, a) => sum + a.allocatedKwh, 0),
        },
    };
}
