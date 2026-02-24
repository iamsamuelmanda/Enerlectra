/**
 * Snapshot Engine
 * 
 * Creates immutable point-in-time calculations of cluster state.
 * Snapshots are NEVER updated, only appended.
 * Enables replay, audit, and explainability.
 */

import { LifecycleState } from '../../lifecycle/types';
import {
  MARKETPLACE_INVARIANTS,
  MARKETPLACE_STATE_RULES,
  MarketplaceErrorCode,
  MARKETPLACE_ERROR_MESSAGES,
} from '../rules/MarketplaceInvariants';

export interface SnapshotInput {
  clusterId: string;
  currentState: LifecycleState;
  targetUSD: number;
  currentUSD: number;
  targetKw: number;
  monthlyKwh: number;
  contributions: ContributionSnapshot[];
  triggeredBy: SnapshotTrigger;
  metadata?: Record<string, any>;
}

export interface ContributionSnapshot {
  userId: string;
  userName: string;
  userClass: 'STARTER' | 'INVESTOR' | 'ANCHOR';
  pcus: number;
  timestamp: string;          // ISO 8601
  earlyInvestorBonus: number; // 1.0 or 1.1
}

export interface ParticipantSnapshot {
  userId: string;
  userName: string;
  userClass: 'STARTER' | 'INVESTOR' | 'ANCHOR';
  pcus: number;
  ownershipPct: number;
  kwhPerMonth: number;
  monthlyValueZMW: number;
  contributionCount: number;
  firstContributionAt: string; // ISO 8601
  lastContributionAt: string;  // ISO 8601
  earlyInvestorBonus: number;
}

export interface ClusterSnapshot {
  id: string;
  clusterId: string;
  version: number;
  lifecycleState: LifecycleState;
  timestamp: string; // ISO 8601
  triggeredBy: SnapshotTrigger;

  // Financial state
  targetUSD: number;
  currentUSD: number;
  fundingPct: number;
  totalPCUs: number;

  // Energy state
  targetKw: number;
  monthlyKwh: number;

  // Participants
  participantCount: number;
  participants: ParticipantSnapshot[];

  // Distribution metrics
  giniCoefficient: number; // 0 = perfect equality, 1 = maximum inequality
  herfindahlIndex: number; // ownership concentration
  largestOwnershipPct: number;

  // Calculation trace (for explainability)
  calculationTrace: CalculationStep[];

  // Immutability proof
  previousSnapshotId: string | null;
  hash: string;

  metadata?: Record<string, any>;
}

export type SnapshotTrigger =
  | 'CONTRIBUTION_ADDED'
  | 'CONTRIBUTION_WITHDRAWN'
  | 'STATE_TRANSITION'
  | 'SETTLEMENT_EXECUTED'
  | 'MANUAL_SNAPSHOT'
  | 'SCHEDULED_SNAPSHOT';

export interface CalculationStep {
  step: number;
  operation: string;
  input: Record<string, any>;
  output: Record<string, any>;
  formula: string;
  explanation: string;
}

export interface SnapshotValidation {
  allowed: boolean;
  errorCode?: MarketplaceErrorCode;
  errorMessage?: string;
}

export class SnapshotValidationError extends Error {
  constructor(
    public code: MarketplaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

export type SnapshotIdGenerator = (clusterId: string) => string;

/**
 * Snapshot Engine
 */
export class SnapshotEngine {
  private static idGenerator: SnapshotIdGenerator = (clusterId: string) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `SNAP-${clusterId}-${timestamp}-${random}`;
  };

  static configure(options: { idGenerator?: SnapshotIdGenerator } = {}) {
    if (options.idGenerator) this.idGenerator = options.idGenerator;
  }

  /**
   * Create immutable snapshot of cluster state
   */
  static async createSnapshot(
    input: SnapshotInput,
    previousSnapshot: ClusterSnapshot | null,
    ratePerKwhZMW: number = 0.50,
  ): Promise<ClusterSnapshot> {
    // Validate snapshot is allowed
    const validation = this.validateSnapshot(input, previousSnapshot);
    if (!validation.allowed) {
      throw new SnapshotValidationError(
        validation.errorCode ?? MarketplaceErrorCode.SNAPSHOT_IN_WRONG_STATE,
        validation.errorMessage ??
          MARKETPLACE_ERROR_MESSAGES[
            validation.errorCode ?? MarketplaceErrorCode.SNAPSHOT_IN_WRONG_STATE
          ],
      );
    }

    // Calculate participant positions
    const participants = this.calculateParticipants(
      input.contributions,
      input.currentUSD,
      input.monthlyKwh,
      ratePerKwhZMW,
    );

    // Calculate distribution metrics
    const giniCoefficient = this.calculateGiniCoefficient(participants);
    const herfindahlIndex = this.calculateHerfindahlIndex(participants);
    const largestOwnershipPct = participants.length
      ? Math.max(...participants.map(p => p.ownershipPct))
      : 0;

    // Generate calculation trace
    const calculationTrace = this.generateCalculationTrace(
      input,
      participants,
      ratePerKwhZMW,
    );

    // Create snapshot
    const snapshot: ClusterSnapshot = {
      id: this.generateSnapshotId(input.clusterId),
      clusterId: input.clusterId,
      version: (previousSnapshot?.version || 0) + 1,
      lifecycleState: input.currentState,
      timestamp: new Date().toISOString(),
      triggeredBy: input.triggeredBy,

      targetUSD: input.targetUSD,
      currentUSD: input.currentUSD,
      fundingPct: (input.currentUSD / input.targetUSD) * 100,
      totalPCUs: input.currentUSD, // 1 PCU = 1 USD

      targetKw: input.targetKw,
      monthlyKwh: input.monthlyKwh,

      participantCount: participants.length,
      participants,

      giniCoefficient,
      herfindahlIndex,
      largestOwnershipPct,

      calculationTrace,

      previousSnapshotId: previousSnapshot?.id || null,
      hash: '', // Will be calculated

      metadata: input.metadata,
    };

    // Calculate hash (for immutability proof)
    snapshot.hash = this.calculateHash(snapshot);

    return snapshot;
  }

  /**
   * Validate snapshot creation is allowed
   */
  private static validateSnapshot(
    input: SnapshotInput,
    previousSnapshot: ClusterSnapshot | null,
  ): SnapshotValidation {
    // Check 1: State allows snapshots
    if (!MARKETPLACE_STATE_RULES.SNAPSHOT_ALLOWED.includes(input.currentState)) {
      return {
        allowed: false,
        errorCode: MarketplaceErrorCode.SNAPSHOT_IN_WRONG_STATE,
        errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.SNAPSHOT_IN_WRONG_STATE],
      };
    }

    // Check 2: Not too frequent (anti-spam)
    if (previousSnapshot) {
      const secondsSinceLast =
        (Date.now() - new Date(previousSnapshot.timestamp).getTime()) / 1000;

      if (secondsSinceLast < MARKETPLACE_INVARIANTS.SNAPSHOT.MIN_INTERVAL_SECONDS) {
        return {
          allowed: false,
          errorCode: MarketplaceErrorCode.SNAPSHOT_TOO_FREQUENT,
          errorMessage: MARKETPLACE_ERROR_MESSAGES[MarketplaceErrorCode.SNAPSHOT_TOO_FREQUENT],
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Calculate participant positions
   */
  private static calculateParticipants(
    contributions: ContributionSnapshot[],
    totalUSD: number,
    monthlyKwh: number,
    ratePerKwhZMW: number,
  ): ParticipantSnapshot[] {
    // Group contributions by user
    const userContributions = new Map<string, ContributionSnapshot[]>();

    contributions.forEach(contribution => {
      const existing = userContributions.get(contribution.userId) || [];
      existing.push(contribution);
      userContributions.set(contribution.userId, existing);
    });

    // Calculate positions
    const participants: ParticipantSnapshot[] = [];

    userContributions.forEach((userContribs, userId) => {
      const totalPCUs = userContribs.reduce((sum, c) => sum + c.pcus, 0);
      const ownershipPct = totalUSD > 0 ? (totalPCUs / totalUSD) * 100 : 0;
      const kwhPerMonth = (ownershipPct / 100) * monthlyKwh;
      const monthlyValueZMW = kwhPerMonth * ratePerKwhZMW;

      const sortedContribs = userContribs.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      participants.push({
        userId,
        userName: userContribs[0].userName,
        userClass: userContribs[0].userClass,
        pcus: totalPCUs,
        ownershipPct,
        kwhPerMonth,
        monthlyValueZMW,
        contributionCount: userContribs.length,
        firstContributionAt: sortedContribs[0].timestamp,
        lastContributionAt: sortedContribs[sortedContribs.length - 1].timestamp,
        earlyInvestorBonus: userContribs[0].earlyInvestorBonus,
      });
    });

    // Sort by ownership descending
    return participants.sort((a, b) => b.ownershipPct - a.ownershipPct);
  }

  /**
   * Calculate Gini coefficient (inequality measure)
   */
  private static calculateGiniCoefficient(participants: ParticipantSnapshot[]): number {
    if (participants.length === 0) return 0;
    if (participants.length === 1) return 0;

    const sorted = [...participants].sort((a, b) => a.ownershipPct - b.ownershipPct);
    const n = sorted.length;

    let sumOfProducts = 0;
    sorted.forEach((p, i) => {
      sumOfProducts += (i + 1) * p.ownershipPct;
    });

    const sumOfOwnership = sorted.reduce((sum, p) => sum + p.ownershipPct, 0);

    const gini = (2 * sumOfProducts) / (n * sumOfOwnership) - (n + 1) / n;

    return Math.max(0, Math.min(1, gini));
  }

  /**
   * Calculate Herfindahl-Hirschman Index (concentration measure)
   */
  private static calculateHerfindahlIndex(participants: ParticipantSnapshot[]): number {
    if (participants.length === 0) return 0;

    const hhi = participants.reduce((sum, p) => {
      return sum + Math.pow(p.ownershipPct, 2);
    }, 0);

    return hhi;
  }

  /**
   * Generate calculation trace for explainability
   */
  private static generateCalculationTrace(
    input: SnapshotInput,
    participants: ParticipantSnapshot[],
    ratePerKwhZMW: number,
  ): CalculationStep[] {
    const trace: CalculationStep[] = [];

    // Step 1: Calculate total PCUs
    trace.push({
      step: 1,
      operation: 'CALCULATE_TOTAL_PCUS',
      input: {
        currentUSD: input.currentUSD,
      },
      output: {
        totalPCUs: input.currentUSD,
      },
      formula: '1 PCU = 1 USD invested',
      explanation: 'PCUs represent contribution units. Each dollar contributed equals 1 PCU.',
    });

    // Step 2: Calculate funding percentage
    trace.push({
      step: 2,
      operation: 'CALCULATE_FUNDING_PCT',
      input: {
        currentUSD: input.currentUSD,
        targetUSD: input.targetUSD,
      },
      output: {
        fundingPct: (input.currentUSD / input.targetUSD) * 100,
      },
      formula: '(Current USD / Target USD) × 100',
      explanation: 'Percentage of funding goal achieved.',
    });

    // Step 3: For each participant, calculate ownership and value
    participants.forEach((participant, index) => {
      trace.push({
        step: 3 + index * 3,
        operation: 'CALCULATE_OWNERSHIP',
        input: {
          userId: participant.userId,
          userPCUs: participant.pcus,
          totalPCUs: input.currentUSD,
        },
        output: {
          ownershipPct: participant.ownershipPct,
        },
        formula: '(User PCUs / Total PCUs) × 100',
        explanation: `${participant.userName}'s ownership percentage in the cluster.`,
      });

      // Step 4: Calculate energy allocation
      trace.push({
        step: 4 + index * 3,
        operation: 'CALCULATE_ENERGY_ALLOCATION',
        input: {
          ownershipPct: participant.ownershipPct,
          monthlyKwh: input.monthlyKwh,
        },
        output: {
          kwhPerMonth: participant.kwhPerMonth,
        },
        formula: '(Ownership % / 100) × Cluster Monthly kWh',
        explanation: `${participant.userName}'s monthly energy allocation based on ownership.`,
      });

      // Step 5: Calculate monetary value
      trace.push({
        step: 5 + index * 3,
        operation: 'CALCULATE_MONTHLY_VALUE',
        input: {
          kwhPerMonth: participant.kwhPerMonth,
          ratePerKwhZMW: ratePerKwhZMW,
        },
        output: {
          monthlyValueZMW: participant.monthlyValueZMW,
        },
        formula: 'kWh per Month × Rate per kWh (ZMW)',
        explanation: `Monetary value of ${participant.userName}'s energy allocation.`,
      });
    });

    return trace;
  }

  /**
   * Generate unique snapshot ID
   */
  private static generateSnapshotId(clusterId: string): string {
    return this.idGenerator(clusterId);
  }

  /**
   * Calculate snapshot hash (for immutability proof)
   */
  private static calculateHash(snapshot: ClusterSnapshot): string {
    // In production: Use crypto.createHash('sha256')
    // For now: Simple deterministic hash
    const data = JSON.stringify({
      id: snapshot.id,
      clusterId: snapshot.clusterId,
      version: snapshot.version,
      timestamp: snapshot.timestamp,
      currentUSD: snapshot.currentUSD,
      participants: snapshot.participants.map(p => ({
        userId: p.userId,
        pcus: p.pcus,
        ownershipPct: p.ownershipPct,
      })),
      previousSnapshotId: snapshot.previousSnapshotId,
    });

    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
   * Verify snapshot integrity
   */
  static verifySnapshot(snapshot: ClusterSnapshot): boolean {
    const recalculatedHash = this.calculateHash({
      ...snapshot,
      hash: '', // Exclude hash from calculation
    });

    return recalculatedHash === snapshot.hash;
  }

  /**
   * Compare two snapshots (for audit/replay)
   */
  static compareSnapshots(
    before: ClusterSnapshot,
    after: ClusterSnapshot,
  ): {
    fundingChange: number;
    participantChange: number;
    ownershipChanges: Map<string, number>;
  } {
    const fundingChange = after.currentUSD - before.currentUSD;
    const participantChange = after.participantCount - before.participantCount;

    const ownershipChanges = new Map<string, number>();

    after.participants.forEach(afterParticipant => {
      const beforeParticipant = before.participants.find(
        p => p.userId === afterParticipant.userId,
      );

      const beforeOwnership = beforeParticipant?.ownershipPct || 0;
      const change = afterParticipant.ownershipPct - beforeOwnership;

      if (change !== 0) {
        ownershipChanges.set(afterParticipant.userId, change);
      }
    });

    return {
      fundingChange,
      participantChange,
      ownershipChanges,
    };
  }
}
