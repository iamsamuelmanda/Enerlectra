/**
 * Pure energy balance simulator.
 * No I/O, no side effects.
 */
export function simulateEnergy({ target_kW, days, peakKwhPerKW, avgConsumptionPerHouse, households }) {
    const totalGenerationKwh = target_kW * peakKwhPerKW * days;
    const totalConsumptionKwh = households * avgConsumptionPerHouse * days;
    const surplusKwh = Math.max(0, totalGenerationKwh - totalConsumptionKwh);
    const deficitKwh = Math.max(0, totalConsumptionKwh - totalGenerationKwh);
    let status = 'healthy';
    if (totalGenerationKwh === 0)
        status = 'offline';
    else if (deficitKwh > 0)
        status = 'stressed';
    return {
        totalGenerationKwh,
        totalConsumptionKwh,
        surplusKwh,
        deficitKwh,
        status
    };
}
