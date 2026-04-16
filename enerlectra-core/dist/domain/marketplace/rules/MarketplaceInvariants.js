/**
 * Marketplace Invariants
 *
 * These rules are IMMUTABLE and enforced at the domain layer.
 * UI cannot bypass. API cannot override. Persistence validates.
 */
/**
 * Core marketplace invariants that must NEVER be violated
 */
export const MARKETPLACE_INVARIANTS = {
    /**
     * Anti-whale protection: Maximum ownership percentage per user per cluster
     */
    MAX_OWNERSHIP_PCT: 30,
    /**
     * Anti-dilution: Maximum ownership loss for early investors in a single round
     */
    MAX_DILUTION_PCT: 20,
    /**
     * Early investor bonus: Multiplier for contributions in first 30% of funding
     */
    EARLY_INVESTOR_BONUS_MULTIPLIER: 1.1,
    EARLY_INVESTOR_THRESHOLD_PCT: 30,
    /**
     * Contribution classes with hard limits
     */
    CONTRIBUTION_CLASSES: {
        STARTER: {
            minUSD: 10,
            maxUSD: 100,
            maxOwnershipPct: 10,
            suggestedClusters: 3,
        },
        INVESTOR: {
            minUSD: 100,
            maxUSD: 1000,
            maxOwnershipPct: 20,
            suggestedClusters: 5,
        },
        ANCHOR: {
            minUSD: 1000,
            maxUSD: 10000,
            maxOwnershipPct: 30,
            suggestedClusters: 10,
        },
    },
    /**
     * Finality rules: After what point are contributions locked?
     */
    FINALITY: {
        /**
         * Contributions can be withdrawn before cluster reaches this threshold
         */
        SOFT_FINALITY_PCT: 80,
        /**
         * After 100% funding, contributions are LOCKED (cannot withdraw)
         */
        HARD_FINALITY_PCT: 100,
        /**
         * Grace period (hours) after contribution before it locks
         */
        CONTRIBUTION_GRACE_PERIOD_HOURS: 24,
    },
    /**
     * Snapshot requirements
     */
    SNAPSHOT: {
        /**
         * Minimum interval between snapshots (prevents spam)
         */
        MIN_INTERVAL_SECONDS: 60,
        /**
         * Snapshots are REQUIRED at these lifecycle transitions
         */
        REQUIRED_AT_STATES: [
            'FUNDED',
            'FINALIZED',
            'OPERATIONAL',
        ],
    },
    /**
     * Settlement requirements
     */
    SETTLEMENT: {
        /**
         * Only these states allow settlement execution
         */
        ALLOWED_STATES: [
            'OPERATIONAL',
        ],
        /**
         * Settlement frequency (days)
         */
        FREQUENCY_DAYS: 30,
    },
};
/**
 * Lifecycle state transition rules for marketplace actions
 */
export const MARKETPLACE_STATE_RULES = {
    /**
     * Which states allow new contributions?
     */
    CONTRIBUTION_ALLOWED: [
        'PLANNING',
        'FUNDING',
    ],
    /**
     * Which states allow contribution withdrawal?
     */
    WITHDRAWAL_ALLOWED: [
        'PLANNING',
        'FUNDING', // Only before soft finality
    ],
    /**
     * Which states allow ownership transfers (marketplace trades)?
     */
    TRANSFER_ALLOWED: [
        'FUNDED',
        'INSTALLING',
        'OPERATIONAL',
    ],
    /**
     * Which states allow supplier matching?
     */
    SUPPLIER_MATCHING_ALLOWED: [
        'FUNDED',
    ],
    /**
     * Which states allow snapshot creation?
     */
    SNAPSHOT_ALLOWED: [
        'PLANNING',
        'FUNDING',
        'FUNDED',
        'INSTALLING',
        'OPERATIONAL',
    ],
    /**
     * Which states are terminal (no more marketplace actions)?
     */
    TERMINAL_STATES: [
        'CANCELLED',
        'FAILED',
    ],
};
/**
 * Marketplace action triggers state transitions
 */
export const MARKETPLACE_TRIGGERS = {
    /**
     * Contribution reaches 100% → FUNDING to FUNDED
     */
    FULL_FUNDING: {
        fromState: 'FUNDING',
        toState: 'FUNDED',
        condition: (fundingPct) => fundingPct >= 100,
        requiresSnapshot: true,
    },
    /**
     * Supplier selected → FUNDED to INSTALLING
     */
    SUPPLIER_SELECTED: {
        fromState: 'FUNDED',
        toState: 'INSTALLING',
        condition: (supplierConfirmed) => supplierConfirmed === true,
        requiresSnapshot: true,
    },
    /**
     * Installation complete → INSTALLING to OPERATIONAL
     */
    INSTALLATION_COMPLETE: {
        fromState: 'INSTALLING',
        toState: 'OPERATIONAL',
        condition: (installationVerified) => installationVerified === true,
        requiresSnapshot: true,
    },
    /**
     * Funding fails → FUNDING to CANCELLED
     */
    FUNDING_FAILED: {
        fromState: 'FUNDING',
        toState: 'CANCELLED',
        condition: (deadlinePassed, fundingPct) => deadlinePassed && fundingPct < 100,
        requiresSnapshot: true,
    },
};
/**
 * Error codes for marketplace violations
 */
export var MarketplaceErrorCode;
(function (MarketplaceErrorCode) {
    // Contribution errors
    MarketplaceErrorCode["CONTRIBUTION_BELOW_CLASS_MIN"] = "CONTRIBUTION_BELOW_CLASS_MIN";
    MarketplaceErrorCode["CONTRIBUTION_ABOVE_CLASS_MAX"] = "CONTRIBUTION_ABOVE_CLASS_MAX";
    MarketplaceErrorCode["OWNERSHIP_EXCEEDS_WHALE_CAP"] = "OWNERSHIP_EXCEEDS_WHALE_CAP";
    MarketplaceErrorCode["OWNERSHIP_EXCEEDS_CLASS_CAP"] = "OWNERSHIP_EXCEEDS_CLASS_CAP";
    MarketplaceErrorCode["CLUSTER_OVERFUNDED"] = "CLUSTER_OVERFUNDED";
    MarketplaceErrorCode["CONTRIBUTION_IN_WRONG_STATE"] = "CONTRIBUTION_IN_WRONG_STATE";
    MarketplaceErrorCode["CLUSTER_IS_FINALIZED"] = "CLUSTER_IS_FINALIZED";
    // Withdrawal errors
    MarketplaceErrorCode["WITHDRAWAL_IN_WRONG_STATE"] = "WITHDRAWAL_IN_WRONG_STATE";
    MarketplaceErrorCode["WITHDRAWAL_PAST_FINALITY"] = "WITHDRAWAL_PAST_FINALITY";
    MarketplaceErrorCode["CONTRIBUTION_IS_LOCKED"] = "CONTRIBUTION_IS_LOCKED";
    // Transfer errors
    MarketplaceErrorCode["TRANSFER_IN_WRONG_STATE"] = "TRANSFER_IN_WRONG_STATE";
    MarketplaceErrorCode["TRANSFER_TO_SELF"] = "TRANSFER_TO_SELF";
    MarketplaceErrorCode["BUYER_EXCEEDS_WHALE_CAP"] = "BUYER_EXCEEDS_WHALE_CAP";
    // Snapshot errors
    MarketplaceErrorCode["SNAPSHOT_TOO_FREQUENT"] = "SNAPSHOT_TOO_FREQUENT";
    MarketplaceErrorCode["SNAPSHOT_IN_WRONG_STATE"] = "SNAPSHOT_IN_WRONG_STATE";
    // Settlement errors
    MarketplaceErrorCode["SETTLEMENT_IN_WRONG_STATE"] = "SETTLEMENT_IN_WRONG_STATE";
    MarketplaceErrorCode["SETTLEMENT_TOO_FREQUENT"] = "SETTLEMENT_TOO_FREQUENT";
    // Supplier errors
    MarketplaceErrorCode["SUPPLIER_MATCHING_IN_WRONG_STATE"] = "SUPPLIER_MATCHING_IN_WRONG_STATE";
    MarketplaceErrorCode["CLUSTER_NOT_FULLY_FUNDED"] = "CLUSTER_NOT_FULLY_FUNDED";
})(MarketplaceErrorCode || (MarketplaceErrorCode = {}));
/**
 * Human-readable error messages
 */
export const MARKETPLACE_ERROR_MESSAGES = {
    [MarketplaceErrorCode.CONTRIBUTION_BELOW_CLASS_MIN]: 'Contribution below minimum for your class',
    [MarketplaceErrorCode.CONTRIBUTION_ABOVE_CLASS_MAX]: 'Contribution exceeds maximum for your class',
    [MarketplaceErrorCode.OWNERSHIP_EXCEEDS_WHALE_CAP]: 'Would exceed 30% ownership cap (anti-whale protection)',
    [MarketplaceErrorCode.OWNERSHIP_EXCEEDS_CLASS_CAP]: 'Would exceed ownership cap for your class',
    [MarketplaceErrorCode.CLUSTER_OVERFUNDED]: 'Cluster has reached 100% funding',
    [MarketplaceErrorCode.CONTRIBUTION_IN_WRONG_STATE]: 'Cluster not accepting contributions in current state',
    [MarketplaceErrorCode.CLUSTER_IS_FINALIZED]: 'Cluster is finalized and locked',
    [MarketplaceErrorCode.WITHDRAWAL_IN_WRONG_STATE]: 'Withdrawals not allowed in current cluster state',
    [MarketplaceErrorCode.WITHDRAWAL_PAST_FINALITY]: 'Cannot withdraw after cluster reached 80% funding',
    [MarketplaceErrorCode.CONTRIBUTION_IS_LOCKED]: 'Contribution has passed 24-hour grace period',
    [MarketplaceErrorCode.TRANSFER_IN_WRONG_STATE]: 'Ownership transfers not allowed in current state',
    [MarketplaceErrorCode.TRANSFER_TO_SELF]: 'Cannot transfer ownership to yourself',
    [MarketplaceErrorCode.BUYER_EXCEEDS_WHALE_CAP]: 'Buyer would exceed 30% ownership cap',
    [MarketplaceErrorCode.SNAPSHOT_TOO_FREQUENT]: 'Snapshots limited to one per minute',
    [MarketplaceErrorCode.SNAPSHOT_IN_WRONG_STATE]: 'Snapshots not allowed in current state',
    [MarketplaceErrorCode.SETTLEMENT_IN_WRONG_STATE]: 'Settlement only allowed in OPERATIONAL state',
    [MarketplaceErrorCode.SETTLEMENT_TOO_FREQUENT]: 'Settlement allowed once per 30 days',
    [MarketplaceErrorCode.SUPPLIER_MATCHING_IN_WRONG_STATE]: 'Supplier matching only allowed in FUNDED state',
    [MarketplaceErrorCode.CLUSTER_NOT_FULLY_FUNDED]: 'Cluster must be 100% funded before supplier matching',
};
