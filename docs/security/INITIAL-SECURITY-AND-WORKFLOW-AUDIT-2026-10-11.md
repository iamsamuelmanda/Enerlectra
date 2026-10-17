# Security and End-to-End Workflow Audit — Initial Findings

**Branch:** `reconstruction/platform-identity-boundary`  
**Audit date:** 2026-10-11  
**Status:** Initial read-only audit; findings require fixes and regression tests before merge  
**Scope:** Tenant boundary, database authorization surface, and operational issue → verification lifecycle  
**Production changes:** None. No migrations were applied to the live database during this audit.

## Executive result

The canonical operational model is present and the current database has RLS enabled on every public table returned by the schema inspection. The inspected public SECURITY DEFINER RPCs were not executable by `anon`; the operational RPCs are restricted to `service_role`. These are positive controls, but they do not establish that the complete workflow is safe.

A material workflow-integrity defect remains in verification: the database function can resolve a situation when status is `VERIFIED` even if no observation or event is attached. The existing end-to-end test currently codifies this weak behavior by verifying a situation using only a summary string. The UI API client similarly permits verification without evidence references. This is a release blocker because a submitted status can be treated as proof of resolution.

## Findings

### F-01 — VERIFIED can resolve a situation without supporting evidence

**Severity:** High — release blocker  
**Evidence:** Live definition of `public.record_operational_verification`, and repository migration `supabase/v2/migrations/039_verification_target_consistency.sql`.

The function validates actor membership, `verification.write`, and tenant consistency of the situation/work/action target. However, it does not require `p_observation_id` or `p_event_id`, does not verify those evidence references belong to the same organization, and sets the situation to `RESOLVED` for `p_status = 'VERIFIED'`.

The current `test/v2-operational-intelligence.test.mjs` test titled `verification closes the situation through the authenticated HTTP boundary` passes only `situationId`, `workItemId`, type, status and a caller-provided summary. No evidence record is linked.

**Impact:** The platform can represent a reported outcome as verified without durable, tenant-bound evidence. This violates the invariant that work completion or a status string is not proof of resolution.

**Required correction:**
- A `VERIFIED` result must reference durable evidence created for the operational outcome, not only the original report.
- Evidence IDs must be validated as belonging to the same organization and to the target operational chain.
- Add a canonical evidence-capture operation to the API/client flow; do not make the safe path impossible by adding a database check without providing a supported way to record evidence.
- Update the existing integration test so a summary-only verification is rejected and a verification with valid, tenant-consistent outcome evidence succeeds.
- Add a cross-tenant evidence-reference test and a regression test that failed/partial evidence cannot resolve a situation.

### F-02 — Verification evidence foreign keys are not tenant-composite

**Severity:** High — cross-tenant integrity risk  
**Evidence:** Live constraints on `public.verifications` use single-column foreign keys for `observation_id`, `event_id`, `situation_id`, `work_item_id`, and `action_id`. Unlike the action/work and event/source-observation relationships, these constraints do not bind the referenced ID together with `organization_id`.

The verification RPC checks that the selected situation, work item and action are in the requested organization. It does not check the organization of `p_observation_id` or `p_event_id`.

**Impact:** A caller with the required verification permission can submit a verification for its own tenant while referencing an observation or event from another tenant. The RPC is service-role-only and the API resolves actor membership first, so this is not evidence of unauthenticated direct RPC access; it is a tenant-integrity flaw in an authorized workflow.

**Required correction:** Validate evidence ownership in the RPC and add composite tenant-consistency constraints where schema-compatible. Add tests that deliberately pass an evidence ID from a second tenant and assert the write is rejected without changing the first tenant's situation.

### F-03 — The client workflow has no evidence-reference handoff for verification

**Severity:** High — end-to-end workflow gap  
**Evidence:** `client/src/lib/operational-api.ts` exposes optional `observationId` and `eventId` in `createVerification`, but the existing operational-intelligence integration test and the current UI path can submit verification without either. No dedicated evidence-capture route was identified in the inspected canonical route composition.

**Impact:** The interface can request resolution without first recording and linking outcome evidence. Fixing F-01 safely therefore requires closing the API/client evidence-capture gap, not only tightening the SQL function.

**Required correction:** Define and implement the smallest supported evidence-capture operation needed for an operator or technician to attach an outcome observation/event to the relevant situation/work/action, with actor, organization, provenance, timestamp and correlation context. Then wire verification to that recorded evidence.

## Positive controls observed

- Canonical server composition root uses explicit `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; startup fails closed when required values are missing.
- Tenant resolver validates bearer identity, active actor, active organization membership, organization status, role permissions, capabilities and policies.
- Database inspection found no public tables with RLS disabled.
- Database inspection found no public SECURITY DEFINER functions executable by `anon`.
- Operational issue creation RPC is restricted to `service_role` and independently validates active organization, active actor membership, required permission and assignment scope.
- Existing integration suites cover forged organization headers, inactive actors, missing permissions, idempotent issue creation and action authorization paths. These tests were inspected, not executed as part of this read-only audit.

## Verification limitations

- The live database was inspected read-only. No mutation, migration, or production configuration change was made.
- Repository test files and live SQL definitions were inspected through GitHub/Supabase tools; the local test suite has not been run in this turn.
- A database schema snapshot is not a substitute for authenticated adversarial integration tests.
- CI failures and the exact current branch check state still need separate confirmation.
- Production remains on the legacy `main` runtime; this audit does not authorize a production cutover.

## Gate to clear

Do not merge the reconstruction branch until F-01 through F-03 are fixed, the regression tests pass against the intended database, and the complete operational flow proves that a case can be created, worked, supplied with fresh tenant-bound outcome evidence, and resolved only after valid verification.
