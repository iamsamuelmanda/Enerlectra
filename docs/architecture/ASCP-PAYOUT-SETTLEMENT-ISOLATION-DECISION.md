# ICP Runtime Boundary: Payout and Settlement Isolation

**Status:** Accepted for the reconstruction branch  
**Scope:** ICP operational-intelligence runtime  
**Decision:** Keep payout processing outside the canonical runtime; do not rebuild the legacy payout table or scheduler as part of ICP.

## Finding

The legacy production composition root on `main` imports `settlementCron.ts`, `matchingCron.ts`, and `payoutProcessorCron.ts` as side effects. The payout job schedules itself every 15 minutes by default. Its processor reads and mutates `pending_settlement_payouts`, then calls the Lenco payout adapter. This is consequential financial behavior, not a harmless background task.

The deployed `main` service was last verified against commit `b6b3a5253ea469f73f8bc499653c44bb31e64c1c` on 7 October 2026. Its logs previously reported that `public.pending_settlement_payouts` was absent from the schema cache. This is evidence of a broken legacy path, not a reason to recreate the table.

## ICP decision

The canonical domain for the product serving our ICP is the multi-tenant operational workflow:

`Actor → Membership → Organization → Customer/Site/Asset → Evidence/Event → Situation → Recommendation → Authorization → Work/Action → Verification → Audit`

Payout execution, cluster matching, cluster settlement, treasury, PCU, staking, and marketplace workflows are outside this initial product boundary. ICP can later adapt payment-provider evidence or payment-exception workflows where validated operator needs justify them; this does not imply automated payouts or a universal settlement engine.

## Required runtime boundary

- The canonical server entry point must not import or start `payoutProcessorCron`, `settlementCron`, or `matchingCron`.
- It must not mount legacy settlement, marketplace, staking, or ledger routes as part of the ICP surface.
- Do not create or migrate `pending_settlement_payouts` to silence errors from the excluded subsystem.
- Keep the old implementation isolated while its references are classified. Do not delete provider adapters or reusable payment-evidence logic indiscriminately.
- The runtime-boundary regression test must fail if these legacy jobs are reintroduced into the canonical entry point.

## Deployment safety

This decision applies to the reconstruction branch and its review. It does **not** authorize an immediate production deployment or a destructive change to the currently deployed `main` service. Before any production cutover, verify the exact deployed commit and start command, check recent runtime logs, and establish whether any outstanding payout obligations or consumers still depend on the old path. If production is still running the legacy entry point, treat that as a separate controlled cutover—not as proof that ICP needs the payout subsystem.

## Verification status

The reconstruction branch's `server/src/index.ts` is already the canonical operational composition root and does not import these cron jobs. `test/v2-runtime-boundary.test.mjs` already asserts that the legacy settlement, matching, and payout job references are absent. This change records the explicit product decision and the reason not to restore the missing payout table.

The branch has not been merged and production has not been cut over as part of this decision.
