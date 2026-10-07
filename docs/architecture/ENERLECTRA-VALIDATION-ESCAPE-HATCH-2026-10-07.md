# Enerlectra Validation Escape Hatch — 2026-10-07

## Why this exists

PR #35 currently cannot obtain a normal GitHub Actions execution result. The exact head initially returned failed workflow runs whose jobs exposed no executable steps. Retrying the failed jobs reproduced the same infrastructure-shaped result: jobs completed as failure with `steps: null`.

This is not accepted as evidence that the application code failed.

## Validation strategy

Enerlectra therefore uses independent proof surfaces rather than making GitHub Actions the sole source of truth:

1. **Repository proof**
   - inspect the exact PR head and changed surface;
   - review tenant, authorization, intelligence, action and migration boundaries;
   - preserve the Core + Ellie convergence contract.

2. **Database proof**
   - query the live Supabase project;
   - validate schema/migration state;
   - validate tenant isolation and operational-chain behavior;
   - run Supabase security/performance advisors.

3. **Runtime proof**
   - use an executable external build/runtime surface when available;
   - do not promote a code review into a runtime claim.

4. **Production proof**
   - remains separate from preview/build validation;
   - no production cutover is implied by PR readiness.

## Current exact-head state

Current PR #35 head:

`7fb4684015ff951a2ade65469fc9b341c26b3140`

The head contains the Ellie organizational-intelligence slice plus migration 051.

GitHub Actions still has no usable step-level execution evidence for the current branch. The latest failed jobs expose no steps, so the result is classified as **CI execution unavailable**, not **code failure**.

## Live Supabase validation

Project:

`mtyhzvkiuibigjximsix`

Current state remains deliberately empty:

- organizations: 1
- actors: 0
- active memberships: 0
- enabled capabilities: 0
- active policies: 0
- active Ellie memories: 0
- Ellie learning events: 0

No artificial pilot data has been inserted.

Migration 050 remains applied for tenant-scoped Ellie learning/memory.

Migration 051 is now applied for:

- indexes covering learning-event foreign keys;
- RLS policy `auth.uid()` initialization-plan hardening.

The remaining unused-index advisor findings are expected while the canonical tenant has no actors, memberships, operational records or learning events. They are not treated as defects merely because the tables are empty.

## Architectural conclusion

The correct response to an unavailable CI executor is **not** to weaken the architecture, manufacture test data, or declare success.

The correct boundary is:

```
code review
   +
live schema/security proof
   +
independent executable runtime proof
   +
production proof
```

Each layer must retain its own evidence.

## Merge implication

PR #35 remains **not merge-ready solely on the basis of repository metadata**.

The next decisive gate is executable current-head validation of:

- root install/smoke;
- server typecheck;
- client typecheck/build;
- V2 tenant boundary tests;
- authenticated Action tests;
- Ellie context/learning tests;
- browser authentication → onboarding → workspace → Action/Attempt/Verification path.

No legacy capability is to be deleted merely to make that gate easier to pass.
