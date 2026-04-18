// src/services/aggregateOwnership.ts
export function aggregateOwnership(transactions) {
    const byUser = {};
    for (const tx of transactions) {
        byUser[tx.userId] = (byUser[tx.userId] || 0) + tx.amountPCU;
    }
    const total = Object.values(byUser).reduce((a, b) => a + b, 0);
    return Object.entries(byUser).map(([userId, totalPCU]) => ({
        userId,
        totalPCU,
        percent: total === 0
            ? 0
            : Number(((totalPCU / total) * 100).toFixed(2)),
    }));
}
