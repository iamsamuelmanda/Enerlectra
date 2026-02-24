/**
 * Anti-Whale Engine
 * 
 * Prevents ownership concentration and enforces contribution limits.
 * All validation happens HERE before persistence.
 */

import { LifecycleState } from '../../lifecycle/types';
import {
  MARKETPLACE_INVARIANTS,
  MARKETPLACE_STATE_RULES,
  MarketplaceErrorCode,
  MARKETPLACE_ERROR_MESSAGES,
} from '../rules/MarketplaceInvariants';

export type UserClass = 'STARTER' | 'INVESTOR' | 'ANCHOR';

export interface ContributionRequest {
  userId: string;
  clusterId: string;
  amountUSD: number;
  timestamp: string; // ISO 8601
}

export interface ClusterState {
  id: string;
  lifecycleState: LifecycleState;
  targetUSD: number;
  currentUSD: number;
  fundingPct: number;
  createdAt: string; // ISO 8601
  isLocked: boolean;
}

export interface UserState {
  id: string;
  totalInvestedUSD: number;
  currentClass: UserClass;
  clusterCount: number;
}

export interface UserPosition {
  clusterId: string;
  currentPCUs: number;
  currentOwnershipPct: number;
  contributions: {
    id: string;
    amountUSD: number;
    timestamp: string; // ISO 8601
    isLocked: boolean;
  }[];
}

export interface ValidationResult {
  allowed: boolean;
  errorCode?: MarketplaceErrorCode;
  errorMessage?: string;
  details?: {
    projectedOwnershipPct?: number;
    maxAllowedUSD?: number;
    overflowUSD?: number;
    currentClass?: UserClass;
    nextClass?: UserClass;
  };
}

/**
 * Anti-Whale Engine
 */
export class AntiWhaleEngine {
  /**
   * Validate contribution against ALL marketplace invariants
   */
  static validateContribution(
    request: ContributionRequest,
    cluster: ClusterState,
    user: UserState,
    userPosition: UserPosition | null,
  ): ValidationResult {
    // Check 1: Lifecycle state allows contributions
    const stateCheck = this.checkLifecycleState(cluster);
    if (!stateCheck.allowed) return stateCheck;

    // Check 2: Cluster not locked
    const lockCheck = this.checkClusterLock(cluster);
    if (!lockCheck.allowed) return lockCheck;

    // Check 3: Amount within user class limits
    const classCheck = this.checkClassLimits(request.amountUSD, user.currentClass);
    if (!classCheck.allowed) return classCheck;

    // Check 4: Cluster capacity
    const capacityCheck = this.checkClusterCapacity(
      request.amountUSD,
      cluster,
    );
    if (!capacityCheck.allowed) return capacityCheck;

    // Check 5: Ownership caps (whale + class)
    const ownershipCheck = this.checkOwnershipCaps(
      request.amountUSD,
      cluster,
      user,
      userPosition,
    );
    if (!ownershipCheck.allowed) return ownershipCheck;

    // All checks passed
    return {
      allowed: true,
      details: {
        projectedOwnershipPct: ownershipCheck.details?.projectedOwnershipPct,
        currentClass: user.currentClass,
      },
    };
  }

  /**
   * Check 1: Lifecycle state allows contributions
   */
  private static checkLifecycleState(cluster: ClusterState): ValidationResult {
    if (!MARKETPLACE_STATE_RULES.CONTRIBUTION_ALLOWED.includes(cluster.lifecycleState)) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CONTRIBUTION_IN_WRONG_STATE,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.CONTRIBUTION_IN_WRONG_STATE],
      };
    }
    return { allowed: true };
  }

  /**
   * Check 2: Cluster not locked/finalized
   */
  private static checkClusterLock(cluster: ClusterState): ValidationResult {
    if (cluster.isLocked) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CLUSTER_IS_FINALIZED,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.CLUSTER_IS_FINALIZED],
      };
    }
    return { allowed: true };
  }

  /**
   * Check 3: Amount within class limits
   */
  private static checkClassLimits(amountUSD: number, userClass: UserClass): ValidationResult {
    const limits = MARKETPLACE_INVARIANTS.CONTRIBUTION_CLASSES[userClass];

    if (amountUSD < limits.minUSD) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CONTRIBUTION_BELOW_CLASS_MIN,
        errorMessage: `Minimum contribution for ${userClass} is $${limits.minUSD}`,
      };
    }

    if (amountUSD > limits.maxUSD) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CONTRIBUTION_ABOVE_CLASS_MAX,
        errorMessage: `Maximum contribution for ${userClass} is $${limits.maxUSD}`,
        details: {
          maxAllowedUSD: limits.maxUSD,
          currentClass: userClass,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Check 4: Cluster has capacity
   */
  private static checkClusterCapacity(
    amountUSD: number,
    cluster: ClusterState,
  ): ValidationResult {
    const remainingCapacityUSD = cluster.targetUSD - cluster.currentUSD;

    if (remainingCapacityUSD <= 0) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CLUSTER_OVERFUNDED,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.CLUSTER_OVERFUNDED],
      };
    }

    if (amountUSD > remainingCapacityUSD) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CLUSTER_OVERFUNDED,
        errorMessage: `Cluster only has $${remainingCapacityUSD.toFixed(2)} capacity remaining`,
        details: {
          maxAllowedUSD: remainingCapacityUSD,
          overflowUSD: amountUSD - remainingCapacityUSD,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Check 5: Ownership caps (anti-whale + class limit)
   */
  private static checkOwnershipCaps(
    amountUSD: number,
    cluster: ClusterState,
    user: UserState,
    userPosition: UserPosition | null,
  ): ValidationResult {
    const currentPCUs = userPosition?.currentPCUs || 0;
    const projectedTotalPCUs = cluster.currentUSD + amountUSD;
    const projectedUserPCUs = currentPCUs + amountUSD;
    const projectedOwnershipPct = (projectedUserPCUs / projectedTotalPCUs) * 100;

    // Global whale cap (30%)
    if (projectedOwnershipPct > MARKETPLACE_INVARIANTS.MAX_OWNERSHIP_PCT) {
      const maxAllowedPCUs =
        (MARKETPLACE_INVARIANTS.MAX_OWNERSHIP_PCT / 100) * cluster.currentUSD /
        (1 - MARKETPLACE_INVARIANTS.MAX_OWNERSHIP_PCT / 100);
      const maxAllowedUSD = Math.max(0, maxAllowedPCUs - currentPCUs);

      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.OWNERSHIP_EXCEEDS_WHALE_CAP,
        errorMessage: `Would give you ${projectedOwnershipPct.toFixed(1)}% ownership (max 30%)`,
        details: {
          projectedOwnershipPct,
          maxAllowedUSD: parseFloat(maxAllowedUSD.toFixed(2)),
        },
      };
    }

    // Class-specific cap
    const classLimits = MARKETPLACE_INVARIANTS.CONTRIBUTION_CLASSES[user.currentClass];
    if (projectedOwnershipPct > classLimits.maxOwnershipPct) {
      const maxAllowedPCUs =
        (classLimits.maxOwnershipPct / 100) * cluster.currentUSD /
        (1 - classLimits.maxOwnershipPct / 100);
      const maxAllowedUSD = Math.max(0, maxAllowedPCUs - currentPCUs);

      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.OWNERSHIP_EXCEEDS_CLASS_CAP,
        errorMessage: `${user.currentClass} class limited to ${classLimits.maxOwnershipPct}% ownership`,
        details: {
          projectedOwnershipPct,
          maxAllowedUSD: parseFloat(maxAllowedUSD.toFixed(2)),
          currentClass: user.currentClass,
        },
      };
    }

    return {
      allowed: true,
      details: { projectedOwnershipPct },
    };
  }

  /**
   * Validate withdrawal
   */
  static validateWithdrawal(
    contributionId: string,
    cluster: ClusterState,
    userPosition: UserPosition,
  ): ValidationResult {
    // Check 1: State allows withdrawals
    if (!MARKETPLACE_STATE_RULES.WITHDRAWAL_ALLOWED.includes(cluster.lifecycleState)) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.WITHDRAWAL_IN_WRONG_STATE,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.WITHDRAWAL_IN_WRONG_STATE],
      };
    }

    // Check 2: Not past soft finality
    if (cluster.fundingPct >= MARKETPLACE_INVARIANTS.FINALITY.SOFT_FINALITY_PCT) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.WITHDRAWAL_PAST_FINALITY,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.WITHDRAWAL_PAST_FINALITY],
      };
    }

    // Check 3: Contribution not locked
    const contribution = userPosition.contributions.find(c => c.id === contributionId);
    if (!contribution) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CONTRIBUTION_IS_LOCKED,
        errorMessage: 'Contribution not found',
      };
    }

    if (contribution.isLocked) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CONTRIBUTION_IS_LOCKED,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.CONTRIBUTION_IS_LOCKED],
      };
    }

    // Check 4: Grace period not expired
    const hoursSinceContribution =
      (Date.now() - new Date(contribution.timestamp).getTime()) / (1000 * 60 * 60);

    if (hoursSinceContribution > MARKETPLACE_INVARIANTS.FINALITY.CONTRIBUTION_GRACE_PERIOD_HOURS) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.CONTRIBUTION_IS_LOCKED,
        errorMessage: 'Contribution has passed 24-hour grace period',
      };
    }

    return { allowed: true };
  }

  /**
   * Validate ownership transfer (marketplace trade)
   */
  static validateTransfer(
    ownershipPct: number,
    cluster: ClusterState,
    fromUser: UserState,
    toUser: UserState,
    toUserPosition: UserPosition | null,
  ): ValidationResult {
    // Check 1: State allows transfers
    if (!MARKETPLACE_STATE_RULES.TRANSFER_ALLOWED.includes(cluster.lifecycleState)) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.TRANSFER_IN_WRONG_STATE,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.TRANSFER_IN_WRONG_STATE],
      };
    }

    // Check 2: Not transferring to self
    if (fromUser.id === toUser.id) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.TRANSFER_TO_SELF,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.TRANSFER_TO_SELF],
      };
    }

    // Check 3: Buyer doesn't exceed whale cap
    const buyerCurrentPct = toUserPosition?.currentOwnershipPct || 0;
    const buyerProjectedPct = buyerCurrentPct + ownershipPct;

    if (buyerProjectedPct > MARKETPLACE_INVARIANTS.MAX_OWNERSHIP_PCT) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.BUYER_EXCEEDS_WHALE_CAP,
        errorMessage: `Buyer would have ${buyerProjectedPct.toFixed(1)}% ownership (max 30%)`,
        details: {
          projectedOwnershipPct: buyerProjectedPct,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Determine user class based on total investment
   */
  static determineUserClass(totalInvestedUSD: number): UserClass {
    if (totalInvestedUSD < 100) return 'STARTER';
    if (totalInvestedUSD < 1000) return 'INVESTOR';
    return 'ANCHOR';
  }

  /**
   * Calculate early investor bonus
   */
  static calculateEarlyInvestorBonus(clusterFundingPct: number): number {
    if (clusterFundingPct <= MARKETPLACE_INVARIANTS.EARLY_INVESTOR_THRESHOLD_PCT) {
      return MARKETPLACE_INVARIANTS.EARLY_INVESTOR_BONUS_MULTIPLIER;
    }
    return 1.0;
  }
}
