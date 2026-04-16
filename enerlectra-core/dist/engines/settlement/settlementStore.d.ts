import { SettlementInstruction } from './settlementTypes';
/**
 * Hard guarantees:
 * - ❌ no delete
 * - ❌ no in-place update
 * - ✅ only append
 * - ✅ corrections = new record (supersedesSettlementId)
 */
export declare function appendSettlements(settlements: SettlementInstruction[]): SettlementInstruction[];
export declare function getAllSettlements(): SettlementInstruction[];
export declare function getSettlementsByDistribution(distributionId: string): SettlementInstruction[];
export declare function getSettlementsByUser(userId: string): SettlementInstruction[];
export declare function getSettlementsByCluster(clusterId: string): SettlementInstruction[];
/**
 * Simple net view: sum of amountZMW for a user.
 * This is a read model; it NEVER writes.[web:24]
 */
export declare function getNetForUser(userId: string): {
    userId: string;
    netZMW: number;
};
