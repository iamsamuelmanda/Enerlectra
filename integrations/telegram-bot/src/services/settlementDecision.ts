export type SettlementDecision = 'INSTANT' | 'REVIEW' | 'REJECT';

export function decideSettlement(score: number, amount: number): SettlementDecision {
  if (amount > 500) return 'REVIEW';        // high-value always reviewed
  if (score >= 0.75) return 'INSTANT';      // lowered from 0.8
  if (score >= 0.45) return 'REVIEW';       // lowered from 0.5
  return 'REJECT';
}