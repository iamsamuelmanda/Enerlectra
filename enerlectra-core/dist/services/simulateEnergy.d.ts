export type SimulationInput = {
    target_kW: number;
    days: number;
    peakKwhPerKW: number;
    avgConsumptionPerHouse: number;
    households: number;
};
export type SimulationResult = {
    totalGenerationKwh: number;
    totalConsumptionKwh: number;
    surplusKwh: number;
    deficitKwh: number;
    status: 'healthy' | 'stressed' | 'offline';
};
/**
 * Pure energy balance simulator.
 * No I/O, no side effects.
 */
export declare function simulateEnergy({ target_kW, days, peakKwhPerKW, avgConsumptionPerHouse, households }: SimulationInput): SimulationResult;
