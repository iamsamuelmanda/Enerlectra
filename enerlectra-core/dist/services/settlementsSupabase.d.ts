import { Settlement, ParticipantSettlement } from '../domain/marketplace/engines/SettlementEngine';
/**
 * Create settlement (append-only) + participant_settlements
 */
export declare function createSettlement(settlement: Settlement): Promise<Settlement>;
/**
 * Update settlement status (PROCESSING | COMPLETED | FAILED)
 */
export declare function updateSettlementStatus(settlementId: string, status: 'PROCESSING' | 'COMPLETED' | 'FAILED'): Promise<Settlement>;
/**
 * Update participant settlement status
 */
export declare function updateParticipantSettlementStatus(participantSettlementId: string, status: 'PROCESSING' | 'COMPLETED' | 'FAILED', transactionId?: string): Promise<void>;
/**
 * Get settlement by ID (with participants)
 */
export declare function getSettlementById(settlementId: string): Promise<Settlement | null>;
/**
 * Get latest settlement for a cluster
 */
export declare function getLatestSettlementForCluster(clusterId: string): Promise<Settlement | null>;
/**
 * Get settlement history for cluster
 */
export declare function getSettlementHistoryForCluster(clusterId: string, limit?: number): Promise<Settlement[]>;
/**
 * Get user settlement history (flat ParticipantSettlement list)
 */
export declare function getUserSettlements(userId: string, limit?: number): Promise<ParticipantSettlement[]>;

