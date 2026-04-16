/**
 * Settlement Engine
 *
 * Executes periodic settlements to distribute energy/value to participants.
 * Settlements are immutable and create audit trail.
 */
import { MARKETPLACE_INVARIANTS, MarketplaceErrorCode, MARKETPLACE_ERROR_MESSAGES, } from '../rules/MarketplaceInvariants';
export class DomainValidationError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'DomainValidationError';
    }
}
/**
 * Settlement Engine
 */
export class SettlementEngine {
    static configure(options = {}) {
        if (options.idGenerator)
            this.idGenerator = options.idGenerator;
    }
    /**
     * Execute settlement for a period
     */
    static async executeSettlement(input, previousSettlement) {
        // Validate settlement is allowed
        const validation = this.validateSettlement(input, previousSettlement);
        if (!validation.allowed) {
            throw new DomainValidationError(validation.errorCode ?? MarketplaceErrorCode.SETTLEMENT_IN_WRONG_STATE, validation.errorMessage ??
                MARKETPLACE_ERROR_MESSAGES[validation.errorCode ?? MarketplaceErrorCode.SETTLEMENT_IN_WRONG_STATE]);
        }
        // Calculate participant settlements
        const participantSettlements = this.calculateParticipantSettlements(input.snapshot.participants, input.actualKwhGenerated, input.ratePerKwhZMW);
        // Calculate aggregate metrics
        const allocatedKwh = input.snapshot.participants.reduce((sum, p) => sum + p.kwhPerMonth, 0);
        const utilizationPct = (input.actualKwhGenerated / allocatedKwh) * 100;
        const surplusKwh = Math.max(0, input.actualKwhGenerated - allocatedKwh);
        const totalValueZMW = input.actualKwhGenerated * input.ratePerKwhZMW;
        const distributedValueZMW = participantSettlements.reduce((sum, s) => sum + s.valueZMW, 0);
        const surplusValueZMW = surplusKwh * input.ratePerKwhZMW;
        // Generate calculation trace
        const calculationTrace = this.generateSettlementTrace(input, participantSettlements, allocatedKwh, utilizationPct);
        // Create settlement
        const settlement = {
            id: this.generateSettlementId(input.clusterId),
            clusterId: input.clusterId,
            snapshotId: input.snapshot.id,
            lifecycleState: input.currentState,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            timestamp: new Date().toISOString(),
            allocatedKwh,
            actualKwhGenerated: input.actualKwhGenerated,
            utilizationPct,
            surplusKwh,
            totalValueZMW,
            distributedValueZMW,
            surplusValueZMW,
            participantCount: participantSettlements.length,
            settlements: participantSettlements,
            status: 'PENDING',
            calculationTrace,
            previousSettlementId: previousSettlement?.id || null,
            hash: '', // Will be calculated
            metadata: input.metadata,
        };
        // Calculate hash
        settlement.hash = this.calculateHash(settlement);
        return settlement;
    }
    /**
     * Validate settlement is allowed
     */
    static validateSettlement(input, previousSettlement) {
        // Check 1: State allows settlement
        if (!MARKETPLACE_INVARIANTS.SETTLEMENT.ALLOWED_STATES.includes(input.currentState)) {
            return {
                allowed: false,
                errorCode: MarketplaceErrorCode.SETTLEMENT_IN_WRONG_STATE,
                errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.SETTLEMENT_IN_WRONG_STATE],
            };
        }
        // Check 2: Not too frequent
        if (previousSettlement) {
            const daysSinceLast = (Date.now() - new Date(previousSettlement.timestamp).getTime()) /
                (1000 * 60 * 60 * 24);
            if (daysSinceLast < MARKETPLACE_INVARIANTS.SETTLEMENT.FREQUENCY_DAYS) {
                return {
                    allowed: false,
                    errorCode: MarketplaceErrorCode.SETTLEMENT_TOO_FREQUENT,
                    errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.SETTLEMENT_TOO_FREQUENT],
                };
            }
        }
        return { allowed: true };
    }
    /**
     * Calculate settlements for each participant
     */
    static calculateParticipantSettlements(participants, actualKwhGenerated, ratePerKwhZMW) {
        const totalAllocated = participants.reduce((sum, p) => sum + p.kwhPerMonth, 0);
        return participants.map(participant => {
            // Pro-rata distribution based on ownership
            const actualKwh = (participant.kwhPerMonth / totalAllocated) * actualKwhGenerated;
            const valueZMW = actualKwh * ratePerKwhZMW;
            // Determine distribution method (in production: user preference)
            const distributionMethod = this.determineDistributionMethod(participant);
            return {
                userId: participant.userId,
                userName: participant.userName,
                allocatedKwh: participant.kwhPerMonth,
                actualKwh,
                valueZMW,
                distributionMethod,
                status: 'PENDING',
            };
        });
    }
    /**
     * Determine distribution method for participant
     */
    static determineDistributionMethod(participant) {
        // In production: read from user preferences
        // For now: default based on usage patterns
        // Business/Anchor investors likely prefer grid credit
        if (participant.userClass === 'ANCHOR') {
            return 'GRID_CREDIT';
        }
        // Most users prefer direct energy
        return 'DIRECT_ENERGY';
    }
    /**
     * Generate settlement calculation trace
     */
    static generateSettlementTrace(input, participantSettlements, allocatedKwh, utilizationPct) {
        const trace = [];
        // Step 1: Calculate total allocated
        trace.push({
            step: 1,
            operation: 'CALCULATE_TOTAL_ALLOCATED',
            input: {
                participants: input.snapshot.participantCount,
            },
            output: {
                allocatedKwh,
            },
            explanation: 'Sum of all participant energy allocations based on ownership.',
        });
        // Step 2: Calculate utilization
        trace.push({
            step: 2,
            operation: 'CALCULATE_UTILIZATION',
            input: {
                actualKwhGenerated: input.actualKwhGenerated,
                allocatedKwh,
            },
            output: {
                utilizationPct,
            },
            explanation: 'Percentage of allocated energy that was actually generated.',
        });
        // Step 3-N: Calculate each participant settlement
        participantSettlements.forEach((settlement, index) => {
            trace.push({
                step: 3 + index,
                operation: 'CALCULATE_PARTICIPANT_SETTLEMENT',
                input: {
                    userId: settlement.userId,
                    allocatedKwh: settlement.allocatedKwh,
                    actualKwhGenerated: input.actualKwhGenerated,
                },
                output: {
                    actualKwh: settlement.actualKwh,
                    valueZMW: settlement.valueZMW,
                },
                explanation: `Pro-rata distribution to ${settlement.userName} based on ownership.`,
            });
        });
        return trace;
    }
    /**
     * Process settlement (execute distributions)
     */
    static async processSettlement(settlement) {
        // Update status
        settlement.status = 'PROCESSING';
        // Execute each participant settlement
        for (const participantSettlement of settlement.settlements) {
            try {
                const transactionId = await this.executeDistribution(participantSettlement);
                participantSettlement.transactionId = transactionId;
                participantSettlement.status = 'COMPLETED';
            }
            catch (error) {
                participantSettlement.status = 'FAILED';
                console.error(`Settlement failed for ${participantSettlement.userId}:`, error);
            }
        }
        // Check if all completed
        const allCompleted = settlement.settlements.every(s => s.status === 'COMPLETED');
        settlement.status = allCompleted ? 'COMPLETED' : 'FAILED';
        settlement.completedAt = new Date().toISOString();
        return settlement;
    }
    /**
     * Execute distribution to participant (placeholder)
     */
    static async executeDistribution(settlement) {
        // In production: Integrate with payment/energy delivery systems
        switch (settlement.distributionMethod) {
            case 'DIRECT_ENERGY':
                // Dispatch energy to participant's connection
                return this.dispatchEnergy(settlement);
            case 'GRID_CREDIT':
                // Credit ZESCO account
                return this.creditZESCOAccount(settlement);
            case 'CASH_EQUIVALENT':
                // Send mobile money payment
                return this.sendPayment(settlement);
            case 'SURPLUS_SOLD':
                // Sell to grid/marketplace
                return this.sellToGrid(settlement);
            default:
                throw new Error(`Unknown distribution method: ${settlement.distributionMethod}`);
        }
    }
    static async dispatchEnergy(settlement) {
        // Placeholder: integrate with grid dispatch system
        return `DISPATCH-${Date.now()}-${settlement.userId}`;
    }
    static async creditZESCOAccount(settlement) {
        // Placeholder: integrate with ZESCO API
        return `ZESCO-${Date.now()}-${settlement.userId}`;
    }
    static async sendPayment(settlement) {
        // Placeholder: integrate with MTN Money/Airtel Money
        return `PAYMENT-${Date.now()}-${settlement.userId}`;
    }
    static async sellToGrid(settlement) {
        // Placeholder: integrate with grid trading platform
        return `GRID_SALE-${Date.now()}-${settlement.userId}`;
    }
    /**
     * Generate unique settlement ID
     */
    static generateSettlementId(clusterId) {
        return this.idGenerator(clusterId);
    }
    /**
     * Calculate settlement hash
     */
    static calculateHash(settlement) {
        // Simple hash (replace with SHA-256 in production)
        const data = JSON.stringify({
            id: settlement.id,
            clusterId: settlement.clusterId,
            snapshotId: settlement.snapshotId,
            timestamp: settlement.timestamp,
            actualKwhGenerated: settlement.actualKwhGenerated,
            settlements: settlement.settlements.map(s => ({
                userId: s.userId,
                actualKwh: s.actualKwh,
                valueZMW: s.valueZMW,
            })),
            previousSettlementId: settlement.previousSettlementId,
        });
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(16, '0');
    }
    /**
     * Verify settlement integrity
     */
    static verifySettlement(settlement) {
        const recalculatedHash = this.calculateHash({
            ...settlement,
            hash: '',
        });
        return recalculatedHash === settlement.hash;
    }
}
SettlementEngine.idGenerator = (clusterId) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `SETTLE-${clusterId}-${timestamp}-${random}`;
};
