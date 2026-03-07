/**
 * Settlement State Enum
 * Defines the states in the Enerlectra Engine (EE) state machine
 */

export enum EEState {
    // Initial operational state
    OPERATIONAL = 'OPERATIONAL',
  
    // Production reporting and validation
    PRODUCTION_REPORTED = 'PRODUCTION_REPORTED',
    
    // Economic value computation
    VALUE_COMPUTED = 'VALUE_COMPUTED',
    
    // Entitlement allocation to contributors
    ENTITLEMENTS_ALLOCATED = 'ENTITLEMENTS_ALLOCATED',
    
    // Settlement computation
    SETTLEMENT_COMPUTED = 'SETTLEMENT_COMPUTED',
    
    // Ledger balance verification
    BALANCES_NETTED = 'BALANCES_NETTED',
    
    // Reconciliation complete
    RECONCILIATION_COMPLETE = 'RECONCILIATION_COMPLETE',
    
    // Finality window (24 hours)
    FINALITY_PENDING = 'FINALITY_PENDING',
    
    // Final state - triggers payout
    SETTLEMENT_FINALIZED = 'SETTLEMENT_FINALIZED'
  }
  
  /**
   * Allowed state transitions
   * Enforces deterministic state machine behavior
   */
  export const ALLOWED_TRANSITIONS: Record<EEState, EEState[]> = {
    [EEState.OPERATIONAL]: [EEState.PRODUCTION_REPORTED],
    
    [EEState.PRODUCTION_REPORTED]: [EEState.VALUE_COMPUTED],
    
    [EEState.VALUE_COMPUTED]: [EEState.ENTITLEMENTS_ALLOCATED],
    
    [EEState.ENTITLEMENTS_ALLOCATED]: [EEState.SETTLEMENT_COMPUTED],
    
    [EEState.SETTLEMENT_COMPUTED]: [EEState.BALANCES_NETTED],
    
    [EEState.BALANCES_NETTED]: [EEState.RECONCILIATION_COMPLETE],
    
    [EEState.RECONCILIATION_COMPLETE]: [EEState.FINALITY_PENDING],
    
    [EEState.FINALITY_PENDING]: [EEState.SETTLEMENT_FINALIZED],
    
    [EEState.SETTLEMENT_FINALIZED]: []
  };
  
  /**
   * Validate a state transition
   */
  export function validateTransition(current: EEState, next: EEState): void {
    const allowed = ALLOWED_TRANSITIONS[current] || [];
    
    if (!allowed.includes(next)) {
      throw new Error(
        `Invalid transition: ${current} → ${next}. Allowed: ${allowed.join(', ')}`
      );
    }
  }
  
  /**
   * Check if a state is terminal
   */
  export function isTerminalState(state: EEState): boolean {
    return state === EEState.SETTLEMENT_FINALIZED;
  }
  
  /**
   * Check if a state allows challenge
   */
  export function isChallengeableState(state: EEState): boolean {
    return state === EEState.FINALITY_PENDING;
  }