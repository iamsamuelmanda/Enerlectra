import { SettlementInstruction } from './settlementTypes';
interface DistributionAllocation {
    userId: string;
    allocatedKwh: number;
}
interface GenerateSettlementParams {
    distributionId: string;
    clusterId: string;
    allocations: DistributionAllocation[];
    rateZMWPerKwh: number;
    supersedesSettlementId?: string;
}
/**
 * Pure function: distribution → settlement instructions.
 * No IO, no persistence, no side effects.
 */
export declare function generateSettlementInstructions(params: GenerateSettlementParams): SettlementInstruction[];
export {};
