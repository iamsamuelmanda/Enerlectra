export declare function evaluateCampaign({ totalUnits, targetUnits, deadline, targetSolarKw }: {
    totalUnits: number;
    targetUnits: number;
    deadline: Date;
    targetSolarKw: number;
}): {
    progressPct: number;
    daysRemaining: number;
    isEnded: boolean;
    unlocked: {
        feasibility: boolean;
        procurement: boolean;
        expansion: boolean;
    };
    failureLossKwh: number;
};
