// enerlectra-core/src/services/explainCalculation.ts
export function explainOwnershipCalculation(userPCU, clusterTotalPCU) {
    if (clusterTotalPCU <= 0) {
        return "No contributions recorded for this cluster yet.";
    }
    const pct = (userPCU / clusterTotalPCU) * 100;
    return [
        "Your ownership was calculated as:",
        "",
        "Your total contribution ÷ total cluster contributions",
        `= ${userPCU} ÷ ${clusterTotalPCU}`,
        `= ${pct.toFixed(2)}%`,
    ].join("\n");
}
