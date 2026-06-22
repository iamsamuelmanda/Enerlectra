export declare function simulateOutcome({ installedKw, households, avgConsumptionPerHouse, days }: {
    installedKw: number;
    households: number;
    avgConsumptionPerHouse: number;
    days: number;
}): {
    totalGenerationKwh: number;
    totalConsumptionKwh: number;
    surplusKwh: number;
    deficitKwh: number;
    status: "healthy" | "stressed" | "offline";
};

