export function simulateOutcome({ installedKw, households, avgConsumptionPerHouse, days }) {
    const peakKwhPerKW = 4.5;
    const totalConsumption = households * avgConsumptionPerHouse * days;
    const totalGeneration = installedKw * peakKwhPerKW * days;
    const surplus = Math.max(0, totalGeneration - totalConsumption);
    const deficit = Math.max(0, totalConsumption - totalGeneration);
    let status = 'offline';
    if (totalGeneration >= totalConsumption * 0.95)
        status = 'healthy';
    else if (totalGeneration >= totalConsumption * 0.7)
        status = 'stressed';
    return {
        totalGenerationKwh: totalGeneration,
        totalConsumptionKwh: totalConsumption,
        surplusKwh: surplus,
        deficitKwh: deficit,
        status
    };
}
