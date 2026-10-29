# Enerlectra Reconstruction — Current Reconciliation Baseline

**Assessment date:** 2026-10-30  
**Status:** Active working baseline; not a production-readiness approval  
**Canonical code candidate:** GitLab MR !39, branch `reconstruction/platform-identity-boundary-merged`  
**Governing product boundary:** `docs/product/ENERLECTRA-CUSTOMER-EVIDENCE-PRODUCT-BOUNDARY-2026-10-07.md`

This document is the current evidence snapshot for reconstruction and release planning. It supersedes older repository/runtime descriptions where they conflict with the facts recorded here. Older forensic reports remain historical evidence and must not be read as a statement of the current runtime unless reconfirmed.

## 1. Governing decisions

1. Enerlectra is one platform for operational intelligence for energy-facing businesses, with one canonical identity, tenant, domain and persistence model.
2. The Supabase project `enerlectra-v2` (`mtyhzvkiuibigjximsix`) is the intended canonical database for the reconstructed platform and the future production target.
3. The Supabase project `enerlectra-prod` (`tlaqxnblzerlegezekml`) is legacy/reference infrastructure. It is not the target for reconstructed features, migrations or test execution.
4. The legacy project is not being deleted as part of this reconstruction step. Preserve it as historical/reference infrastructure until data-retention, rollback and dependency questions are explicitly resolved.
5. Legacy code is classified by responsibility and reachability—not by filename. Keep useful domain computation, adapt authorization/data boundaries, quarantine unsupported capabilities, and retire code only after dependencies are proven absent.
6. A successful pipeline proves only the checks executed against that exact commit. It does not prove that the same commit is deployed or that every end-to-end operational workflow works.

## 2. Supabase project findings

### Canonical target: `enerlectra-v2`

Read-only project inspection reports the project as active/healthy in `eu-west-2`. Its migration history includes the reconstruction migration set through `059_server_verified_ownership_transfer`. Migration 059 was applied to this project for isolated integration verification; no production mutation was performed as part of the Render inspection.

This database has been used for integration verification during reconstruction, and it is the user's intended future production target. It has not yet been cut over as the live customer production database. It must therefore be treated as a future production target, not a disposable test database: further mutating integration runs need controlled cleanup or a separate test project, and all known fixture data must be classified before pilot onboarding.

A read-only count on 2026-10-30 returned:

| Table | Current row count |
|---|---:|
| organizations | 6 |
| actors | 11 |
| memberships | 5 |
| membership_roles | 5 |
| customers | 5 |
| sites | 5 |
| assets | 0 |
| observations | 2 |
| events | 2 |
| situations | 2 |
| work_items | 2 |
| verifications | 0 |
| organization_invitations | 0 |

Five organizations were reported with `onboarding_state=ACTIVE` and `status=ACTIVE`; one was reported with `onboarding_state=PENDING_AUTHORITY` and `status=ACTIVE`.

These counts include recognizable test residue, not just a clean base schema. A read-only organization query identified:

- One `Enerlectra` organization, ID `2cd09175-7079-4751-98b7-b3ec6685bc5a`, with `status=ACTIVE` and `onboarding_state=PENDING_AUTHORITY`.
- That `Enerlectra` organization has no `created_by_actor_id`, no active memberships, no owner membership, no customers/sites/assets/observations/events/situations/work/audit/learning records, and one active `Default operating profile`. It is therefore not currently accessible to an authenticated member and must not be treated as the operational account for the real business.
- Five organizations named `V2 Multi Tenant ...` were created by the integration-test fixture pattern. They have matching test customers and sites; two also have observations, events, situations, work items, recommendations and audit records.

These are strong signs of reconstruction/test residue, but not a deletion instruction. The operational rows and append-oriented audit references mean the test fixtures cannot be safely cleaned by deleting organizations alone. Preserve the rows for now; decide whether to retire them with a reviewed, dependency-aware cleanup plan or rebuild the test environment separately. Before opening real customer onboarding, verify the intended real lead/organization is created through the supported onboarding flow and has an active membership.

Security-advisor findings on this project:
- `public.organization_invitations`: RLS is enabled but no table policy was found (INFO). Review intended access; service-mediated access may be deliberate, but this should be explicitly documented and tested.
- Supabase Auth leaked-password protection is disabled (WARN). Decide and verify the appropriate production Auth setting.

### Legacy reference: `enerlectra-prod`

This project retains the previous cluster/PCU, trading, ledger and settlement-oriented schema. A read-only migration-listing call returned no migration records through the connected Supabase tool. The project is not the reconstructed database baseline.

Its security advisor also reports legacy RLS/configuration findings. Do not point the reconstructed runtime at this database, apply reconstruction migrations to it, or use it for integration tests. Keep the explicit CI refusal for this project as a safety guard; that negative guard is not an application dependency.

## 3. Render inspection — confirmed deployment facts

Read-only inspection of the Render workspace found two web services:

### Live service: `Enerlectra`

- Service ID: `srv-da12g5dbedkc73bsse80`
- URL: https://enerlectra.onrender.com
- Configured source repository: `https://github.com/iamsamuelmanda/Enerlectra`
- Configured branch: `main`
- Auto-deploy: enabled
- Latest listed live deployment: commit `06e743f84c4d4a21f494796a792f47ba172b3306`, deployed 2026-10-22.

The deployment logs from 2026-10-22 reported the runtime services as Supabase, Lenco, Prometheus, Cron, Staking, Ledger, Marketplace, EllieAI and PostHog. The logs also showed the payout cron failing with PostgREST error `PGRST205` because `public.pending_settlement_payouts` was absent from the connected database's schema cache. The read-only project comparison below confirms that this table exists in the legacy project but not in V2.

This is evidence that the currently deployed code is still the legacy economic runtime, and that at least one legacy job is not compatible with the schema currently visible to it.

A separate read-only SQL check confirmed that `public.pending_settlement_payouts` and `public.cluster_members` exist in `enerlectra-prod`, while neither exists in `enerlectra-v2`. The 2026-10-22 Render error is therefore consistent with the live service having been pointed at the reconstructed V2 database while still running the legacy runtime. This is a strong diagnostic signal, not proof of the service's exact configured URL: a stale PostgREST schema cache or another configuration issue could produce a similar error. The live Render environment-variable value still needs direct confirmation.

### Validation service: `Enerlectra-exact-head-validation`

- Service ID: `srv-db2s6bcs728c73af94qg`
- URL: https://enerlectra-exact-head-validation.onrender.com
- Configured source repository: `https://github.com/iamsamuelmanda/Enerlectra`
- Configured branch: `reconstruction/platform-identity-boundary`
- Auto-deploy: disabled
- Latest listed live deployment: commit `37ceae65765d12f87aa17d752ae183bc4f2966e7`, deployed 2026-10-15.

This is not the current MR !39 head. It cannot be used as proof that the latest verified GitLab commit is deployed.

## Current GitLab verification status after safe retirement/documentation commits

The last known fully passing pipeline, `3006080361`, ran on commit `9467f3b109b5ce3b3009bc817a29ece94ec21634`. The subsequent changes retired `server/src/admin/index.html` from the legacy Supabase page and added this baseline document. The resulting head is `a0e4d2ee9a63ef7985c1f29a735bb50a4aeb574e`. Pipeline `3006228419` failed with `ci_quota_exceeded`; the jobs were rejected before a runner executed test steps. This is a CI capacity blocker, not evidence of a source-test failure. The latest head therefore does not yet have a fresh passing pipeline.

### Important limitation

The Render service details returned by the available read-only API did not include environment-variable values or a verified database project reference. Therefore the live `SUPABASE_URL` configured on either service has **not been confirmed**. Do not claim that Render is connected to `enerlectra-v2` until the active service's configured URL is checked without exposing secret values.

Render is still connected to the GitHub repository, while the current merge and release evidence is in GitLab. Source-control alignment is a release blocker. No Render environment variables, service settings, deployment, or database records were changed during this inspection.

## 4. Current code reconciliation

### Canonical candidate branch

The reconstruction branch's `server/src/index.ts` uses the canonical environment names:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

It mounts the reconstructed onboarding, organization-context, resource, operational-issue, operations, action, verification and Ellie routes. It does not mount the old cluster, marketplace, staking, legacy ledger or settlement route groups in that composition root. The public WhatsApp webhook remains fail-closed until a trusted channel workflow is connected.

MR !39 was open and draft at the last merge-request inspection. Commit `9467f3b109b5ce3b3009bc817a29ece94ec21634` had a passing GitLab pipeline, including the isolated Supabase onboarding and tenant-isolation gates. The legacy admin HTML was subsequently replaced with an intentionally disconnected retirement notice in a new commit. That new head must pass a fresh pipeline before any passing status is attributed to it.

### Legacy implementation still present

The wider repository still contains legacy server routes, `enerlectra-core` handlers, older React surfaces and a Telegram bot runtime. The Telegram bot source imports cluster, PCU and settlement code from the old core. The core is not proven dead code; some infrastructure and domain logic may be reusable, but the old runtime must not become an alternate source of tenant authority or operational state.

The search for the legacy Supabase project ID on the canonical candidate branch previously found a hardcoded configuration in `server/src/admin/index.html`. That page has now been retired and no longer initializes Supabase or exposes the old cluster/economic interface. Keep the test guard that explicitly rejects the legacy project as a target.

Historical documents may still mention `enerlectra-prod` and legacy environment variables to explain the migration boundary; preserve those references where they are evidence or safety instructions. Remove positive runtime/deployment bindings, not historical audit facts or CI deny-lists.

## 5. Blocking issues and required evidence

| Priority | Issue | Required closure evidence |
|---|---|---|
| P0 | Render production is still configured for GitHub `main`, and the latest deployment is legacy code. | Verify how the GitLab candidate will become the deploy source; confirm service/repository/branch linkage and exact deployed SHA. |
| P0 | Actual Render Supabase target is not verified. | Check the live service's `SUPABASE_URL` project ref without exposing key values; confirm it is `mtyhzvkiuibigjximsix` before deployment. |
| P0 | Legacy jobs are still running in the live Render runtime. | Deploy only after the canonical runtime is approved; confirm old settlement/payout jobs are no longer started by the active entrypoint. |
| P0 | Full operational lifecycle is not yet demonstrated end to end on the final candidate head. | Authenticated integration evidence for issue/evidence/situation/work/action/attempt/verification/audit, including failures and tenant isolation. |
| P1 | Legacy runtime/dependency reachability has not been reconciled to zero or explicitly isolated. | Source/import, job, webhook, package, deployment and database-consumer inventory with a disposition for each retained capability. |
| P1 | Existing V2 project contains rows and a pending-authority organization. | Classify fixture/demo/business data; no cleanup until ownership and intent are established. |
| P1 | V2 Auth/security-advisor findings remain. | Review the invitation-table access design and leaked-password protection; record the remediation decision and verification. |
| P1 | Older architecture/reconciliation documents contain stale snapshots. | Keep this baseline as the current index and update historical docs only when necessary to avoid contradictory current-state claims. |

## 6. Execution sequence

1. Verify Render's live database URL project reference and reconcile the service's source repository/branch with GitLab. Do not retarget the existing legacy runtime to V2 while legacy jobs remain active.
2. Re-run all required CI/security/integration checks on the latest MR !39 head after the admin retirement change.
3. Finish the canonical operational-lifecycle integration test and tenant-boundary review.
4. Finish the repository/runtime dependency census for routes, core handlers, Telegram, WhatsApp, background jobs, frontend reachability, configuration and database consumers.
5. Decide the final disposition of each useful legacy capability: adapt, quarantine or retire.
6. Reconcile V2 test/demo data and the remaining security-advisor findings before real customer onboarding.
7. Make the merge decision only once the exact head has passed checks and the release source/database target is proven.
8. Deploy the canonical runtime in stages and verify runtime health, authenticated onboarding, organizational workspace access and an energy-operator workflow before any pilot.

No console expansion, production database migration, legacy-project deletion or production deployment is authorized by this baseline. This is an evidence-driven reconstruction plan, not a claim that those gates have passed.


## 7. Supabase free-project limit and test-project recovery — 2026-10-30

The user confirmed that `enerlectra-v2` is the canonical future production database, and that one of the unused paused projects may be repurposed for isolated integration testing. The legacy `enerlectra-prod` project is not the reconstruction target.

- Supabase restore of `peekaboo-platform` (`nbtsjtemfvnrnohmbzie`) initially failed because the organization had reached the free-plan limit of two active projects.
- The connected Supabase logs for `enerlectra-prod` were read-only inspected over a 24-hour window. The returned edge-log aggregation showed no user/application API traffic; returned activity consisted of infrastructure/health-management records. This does not prove no outside consumer exists, but supports the user's statement that the legacy project is unused.
- Following the user's explicit direction that the legacy project is not needed, a pause request for `enerlectra-prod` (`tlaqxnblzerlegezekml`) succeeded. This is reversible; the project and its data were not deleted.
- A restore request for `peekaboo-platform` then succeeded, but the project remains in Supabase status `COMING_UP`. The database API currently returns “Database is possibly not accessible at the moment.”
- No migration, schema reset, data cleanup, or test execution has been performed against `peekaboo-platform`. Its contents must be inspected after the database is reachable before any destructive reset or migration.
- `enerlectra-v2` remains active and was not modified by this project-slot operation.

### Next test-project gate

When `peekaboo-platform` becomes accessible, inspect its migration history, table inventory, row counts, Auth users, storage and enabled extensions. If it contains no data that needs preserving, apply the canonical reconstruction migrations from `supabase/v2/migrations/001_foundation.sql` through `059_server_verified_ownership_transfer.sql` in order (after confirming the migration execution method and baseline). Configure CI to use this restored project only as `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` and `SUPABASE_TEST_SERVICE_ROLE_KEY`; production runtime remains pinned to `enerlectra-v2`. Verify migrations, critical grants/RLS and a complete passing integration run before claiming the test environment is ready.
