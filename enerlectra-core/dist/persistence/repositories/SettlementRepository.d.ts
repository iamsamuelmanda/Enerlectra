/**
 * Settlement Repository
 *
 * Handles settlement persistence.
 * Enforces immutability.
 */
import { Pool } from 'pg';
import { Settlement, ParticipantSettlement } from '../../domain/marketplace/engines/SettlementEngine';
export declare class SettlementRepository {
    private pool;
    constructor(pool: Pool);
    /**
     * Create settlement (append-only)
     */
    create(settlement: Settlement): Promise<Settlement>;
    /**
     * Update settlement status (ONLY allowed status changes)
     */
    updateStatus(settlementId: string, status: 'PROCESSING' | 'COMPLETED' | 'FAILED'): Promise<Settlement>;
    /**
     * Update participant settlement status
     */
    updateParticipantStatus(participantSettlementId: string, status: 'PROCESSING' | 'COMPLETED' | 'FAILED', transactionId?: string): Promise<void>;
    /**
     * Get settlement by ID
     */
    getById(settlementId: string): Promise<Settlement | null>;
    /**
     * Get latest settlement for cluster
     */
    getLatestForCluster(clusterId: string): Promise<Settlement | null>;
    /**
     * Get settlement history for cluster
     */
    getHistoryForCluster(clusterId: string, limit?: number): Promise<Settlement[]>;
    /**
     * Get user settlement history
     */
    getUserSettlements(userId: string, limit?: number): Promise<ParticipantSettlement[]>;
    /**
     * Map database row to domain model
     */
    private mapRow;
}

