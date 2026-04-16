import { distributeOutcome } from './distribution';
/**
 * FINAL, AUDITABLE ENERGY DISTRIBUTION
 */
export function generateDistributionSnapshot(clusterId, ownership, totalSurplusKwh) {
    const allocations = distributeOutcome(ownership, totalSurplusKwh);
    return {
        clusterId,
        totalSurplusKwh,
        allocations,
        generatedAt: new Date().toISOString()
    };
}
