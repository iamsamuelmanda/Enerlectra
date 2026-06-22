/**
 * Marketplace Invariants
 *
 * These rules are IMMUTABLE and enforced at the domain layer.
 * UI cannot bypass. API cannot override. Persistence validates.
 */
import { LifecycleState } from '../../lifecycle/types';
/**
 * Core marketplace invariants that must NEVER be violated
 */
export declare const MARKETPLACE_INVARIANTS: {
    /**
     * Anti-whale protection: Maximum ownership percentage per user per cluster
     */
    readonly MAX_OWNERSHIP_PCT: 30;
    /**
     * Anti-dilution: Maximum ownership loss for early investors in a single round
     */
    readonly MAX_DILUTION_PCT: 20;
    /**
     * Early investor bonus: Multiplier for contributions in first 30% of funding
     */
    readonly EARLY_INVESTOR_BONUS_MULTIPLIER: 1.1;
    readonly EARLY_INVESTOR_THRESHOLD_PCT: 30;
    /**
     * Contribution classes with hard limits
     */
    readonly CONTRIBUTION_CLASSES: {
        readonly STARTER: {
            readonly minUSD: 10;
            readonly maxUSD: 100;
            readonly maxOwnershipPct: 10;
            readonly suggestedClusters: 3;
        };
        readonly INVESTOR: {
            readonly minUSD: 100;
            readonly maxUSD: 1000;
            readonly maxOwnershipPct: 20;
            readonly suggestedClusters: 5;
        };
        readonly ANCHOR: {
            readonly minUSD: 1000;
            readonly maxUSD: 10000;
            readonly maxOwnershipPct: 30;
            readonly suggestedClusters: 10;
        };
    };
    /**
     * Finality rules: After what point are contributions locked?
     */
    readonly FINALITY: {
        /**
         * Contributions can be withdrawn before cluster reaches this threshold
         */
        readonly SOFT_FINALITY_PCT: 80;
        /**
         * After 100% funding, contributions are LOCKED (cannot withdraw)
         */
        readonly HARD_FINALITY_PCT: 100;
        /**
         * Grace period (hours) after contribution before it locks
         */
        readonly CONTRIBUTION_GRACE_PERIOD_HOURS: 24;
    };
    /**
     * Snapshot requirements
     */
    readonly SNAPSHOT: {
        /**
         * Minimum interval between snapshots (prevents spam)
         */
        readonly MIN_INTERVAL_SECONDS: 60;
        /**
         * Snapshots are REQUIRED at these lifecycle transitions
         */
        readonly REQUIRED_AT_STATES: LifecycleState[];
    };
    /**
     * Settlement requirements
     */
    readonly SETTLEMENT: {
        /**
         * Only these states allow settlement execution
         */
        readonly ALLOWED_STATES: LifecycleState[];
        /**
         * Settlement frequency (days)
         */
        readonly FREQUENCY_DAYS: 30;
    };
};
/**
 * Lifecycle state transition rules for marketplace actions
 */
export declare const MARKETPLACE_STATE_RULES: {
    /**
     * Which states allow new contributions?
     */
    readonly CONTRIBUTION_ALLOWED: LifecycleState[];
    /**
     * Which states allow contribution withdrawal?
     */
    readonly WITHDRAWAL_ALLOWED: LifecycleState[];
    /**
     * Which states allow ownership transfers (marketplace trades)?
     */
    readonly TRANSFER_ALLOWED: LifecycleState[];
    /**
     * Which states allow supplier matching?
     */
    readonly SUPPLIER_MATCHING_ALLOWED: LifecycleState[];
    /**
     * Which states allow snapshot creation?
     */
    readonly SNAPSHOT_ALLOWED: LifecycleState[];
    /**
     * Which states are terminal (no more marketplace actions)?
     */
    readonly TERMINAL_STATES: LifecycleState[];
};
/**
 * Marketplace action triggers state transitions
 */
export declare const MARKETPLACE_TRIGGERS: {
    /**
     * Contribution reaches 100% → FUNDING to FUNDED
     */
    readonly FULL_FUNDING: {
        readonly fromState: LifecycleState;
        readonly toState: LifecycleState;
        readonly condition: (fundingPct: number) => boolean;
        readonly requiresSnapshot: true;
    };
    /**
     * Supplier selected → FUNDED to INSTALLING
     */
    readonly SUPPLIER_SELECTED: {
        readonly fromState: LifecycleState;
        readonly toState: LifecycleState;
        readonly condition: (supplierConfirmed: boolean) => boolean;
        readonly requiresSnapshot: true;
    };
    /**
     * Installation complete → INSTALLING to OPERATIONAL
     */
    readonly INSTALLATION_COMPLETE: {
        readonly fromState: LifecycleState;
        readonly toState: LifecycleState;
        readonly condition: (installationVerified: boolean) => boolean;
        readonly requiresSnapshot: true;
    };
    /**
     * Funding fails → FUNDING to CANCELLED
     */
    readonly FUNDING_FAILED: {
        readonly fromState: LifecycleState;
        readonly toState: LifecycleState;
        readonly condition: (deadlinePassed: boolean, fundingPct: number) => boolean;
        readonly requiresSnapshot: true;
    };
};
/**
 * Error codes for marketplace violations
 */
export declare enum MarketplaceErrorCode {
    CONTRIBUTION_BELOW_CLASS_MIN = "CONTRIBUTION_BELOW_CLASS_MIN",
    CONTRIBUTION_ABOVE_CLASS_MAX = "CONTRIBUTION_ABOVE_CLASS_MAX",
    OWNERSHIP_EXCEEDS_WHALE_CAP = "OWNERSHIP_EXCEEDS_WHALE_CAP",
    OWNERSHIP_EXCEEDS_CLASS_CAP = "OWNERSHIP_EXCEEDS_CLASS_CAP",
    CLUSTER_OVERFUNDED = "CLUSTER_OVERFUNDED",
    CONTRIBUTION_IN_WRONG_STATE = "CONTRIBUTION_IN_WRONG_STATE",
    CLUSTER_IS_FINALIZED = "CLUSTER_IS_FINALIZED",
    WITHDRAWAL_IN_WRONG_STATE = "WITHDRAWAL_IN_WRONG_STATE",
    WITHDRAWAL_PAST_FINALITY = "WITHDRAWAL_PAST_FINALITY",
    CONTRIBUTION_IS_LOCKED = "CONTRIBUTION_IS_LOCKED",
    TRANSFER_IN_WRONG_STATE = "TRANSFER_IN_WRONG_STATE",
    TRANSFER_TO_SELF = "TRANSFER_TO_SELF",
    BUYER_EXCEEDS_WHALE_CAP = "BUYER_EXCEEDS_WHALE_CAP",
    SNAPSHOT_TOO_FREQUENT = "SNAPSHOT_TOO_FREQUENT",
    SNAPSHOT_IN_WRONG_STATE = "SNAPSHOT_IN_WRONG_STATE",
    SETTLEMENT_IN_WRONG_STATE = "SETTLEMENT_IN_WRONG_STATE",
    SETTLEMENT_TOO_FREQUENT = "SETTLEMENT_TOO_FREQUENT",
    SUPPLIER_MATCHING_IN_WRONG_STATE = "SUPPLIER_MATCHING_IN_WRONG_STATE",
    CLUSTER_NOT_FULLY_FUNDED = "CLUSTER_NOT_FULLY_FUNDED"
}
/**
 * Human-readable error messages
 */
export declare const MARKETPLACE_ERROR_MESSAGES: Record<MarketplaceErrorCode, string>;

