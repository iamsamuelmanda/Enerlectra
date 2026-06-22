/**
 * Settlement Invariants (Production-Grade)
 * BigInt-safe validation with zero tolerance
 * Infrastructure-grade correctness enforcement
 */
import { SettlementCycle } from './settlement-cycle-hardened';
export declare class SettlementInvariantViolation extends Error {
    constructor(message: string);
}
/**
 * Validate all settlement cycle invariants
 * Throws SettlementInvariantViolation if any invariant fails
 *
 * CRITICAL: Uses exact BigInt arithmetic - no tolerance
 */
export declare function validateCycleInvariants(cycle: SettlementCycle): void;
/**
 * Quick validation (throws on first error)
 * Use for fast fail-fast checks
 */
export declare function quickValidate(cycle: SettlementCycle): boolean;
/**
 * Detailed validation (collects all errors)
 * Use for auditing
 */
export declare function detailedValidate(cycle: SettlementCycle): {
    valid: boolean;
    errors: string[];
};

