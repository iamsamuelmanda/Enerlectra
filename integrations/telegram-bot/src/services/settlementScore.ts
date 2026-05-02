// integrations/telegram-bot/src/services/settlementScore.ts

/**
 * Settlement Score Engine
 *
 * Computes a confidence score (0-1) for each meter reading based on:
 * - Physics: does delta respect meter-type max throughput?
 * - Temporal: is the submission interval reasonable?
 * - Trust: user's historical behavior
 * - Device: meter consistency over time
 */

export type ScoreInputs = {
    deltaKwh: number;
    timeSinceLastReadingSec: number;
    maxAllowedKwh: number;
    userTrustScore: number;
    deviceConsistencyScore: number;
  };
  
  export type ScoreBreakdown = {
    physics: number;
    temporal: number;
    trust: number;
    device: number;
  };
  
  export type SettlementScoreResult = {
    score: number;
    breakdown: ScoreBreakdown;
  };
  
  /**
   * Compute a settlement confidence score for a single reading.
   *
   * @param input - ScoreInputs containing reading context
   * @returns SettlementScoreResult with overall score and per-factor breakdown
   */
  export function computeSettlementScore(input: ScoreInputs): SettlementScoreResult {
    // Physics: how close is delta to the physics-based maximum?
    // 1.0 = well within limits, 0.0 = at or exceeds maxAllowed
    const physics =
      input.deltaKwh <= input.maxAllowedKwh
        ? 1
        : Math.max(0, 1 - (input.deltaKwh - input.maxAllowedKwh) / input.maxAllowedKwh);
  
    // Temporal: is the reading submitted at a reasonable interval?
    // Expected baseline: 1 hour (3600s). Shorter intervals score lower.
    const expectedInterval = 3600;
    const temporal = Math.min(1, input.timeSinceLastReadingSec / expectedInterval);
  
    // Trust: user's historical trust score (0-1)
    const trust = Math.min(1, Math.max(0, input.userTrustScore));
  
    // Device: meter consistency score (0-1)
    const device = Math.min(1, Math.max(0, input.deviceConsistencyScore));
  
    // Weighted ensemble
    const weights = {
      physics: 0.45,
      temporal: 0.20,
      trust: 0.25,
      device: 0.10,
    };
  
    const score =
      physics * weights.physics +
      temporal * weights.temporal +
      trust * weights.trust +
      device * weights.device;
  
    return {
      score: Number(score.toFixed(3)),
      breakdown: { physics, temporal, trust, device },
    };
  }