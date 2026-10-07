> **Historical terminology notice (2026-10-07):** This document records an earlier reconstruction phase. Enerlectra is now one canonical platform; "V2" does not denote a second runtime or product. Canonical runtime Supabase variables are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The active product boundary is governed by `docs/product/ENERLECTRA-CUSTOMER-EVIDENCE-PRODUCT-BOUNDARY-2026-10-07.md` and `docs/architecture/ENERLECTRA-CODEBASE-EVIDENCE-RECLASSIFICATION-2026-10-07.md`.

# V2 Reuse and Isolation Plan

Status: PRE-CLEANUP PLAN
Repository: iamsamuelmanda/Enerlectra
Date: 2026-09-18

## Objective

Convert the existing mixed V1 repository into a controlled host for Enerlectra V2 without discarding reusable infrastructure.

V2 is a new operational product layer. V1 remains isolated until its runtime dependencies are understood and decommissioned deliberately.

## Target boundary

```
                    Enerlectra repository
                           │
             ┌─────────────┴─────────────┐
             │                           │
       V2 active path                Legacy V1
             │                           │
       V2 Supabase                 legacy Supabase
             │                           │
 Organization/Actor              PCU/Clusters/Market
 Customer/Site/Asset             Wallets/Settlement
 Evidence/Work/Ellie              Blockchain/Staking
```

V2 may reuse platform infrastructure from the repository, but V2 must not depend on V1 domain state.

## Phase 0 — Freeze and map

- Keep legacy production running unchanged.
- Do not rename/delete legacy modules yet.
- Complete static dependency map.
- Confirm runtime entry points and external integrations.
- Record V1 environment variables separately from V2 variables.

Exit condition: every material module is classified KEEP, ADAPT, ISOLATE, RETIRE, or UNKNOWN.

## Phase 1 — Establish V2 repository boundary

Create a namespaced V2 infrastructure boundary.

Recommended concepts:
- V2 Supabase client
- V2 server-side Supabase client
- V2 authenticated request context
- V2 repository/data-access layer
- V2 domain modules
- V2 application routes

Do not replace the existing V1 Supabase client.

Recommended environment names:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

The service-role value must exist only in trusted server/runtime environments.

## Phase 2 — Reuse platform primitives

Selectively adapt:
- TypeScript configuration
- Express server foundation
- React/Vite application foundation
- structured logging
- metrics/observability
- CI/build/test infrastructure
- event metadata
- correlation/causation
- command contracts
- workflow primitives
- execution context
- WhatsApp transport
- communication infrastructure

Each reused primitive must be checked for hidden V1 database imports.

## Phase 3 — Build V2 foundation against the new project

Use the already-created V2 migrations as the database contract.

Foundation:
- organizations
- actors
- memberships
- roles
- permissions
- role_permissions
- channel_identities

The V2 application must resolve:

Actor → Membership → Organization → Permission

before accessing organization-scoped resources.

## Phase 4 — V2 operational domain

Implement only the frozen first subset:

- customers
- sites
- assets
- observations
- events
- situations
- situation_evidence
- situation_assignments
- work_items
- work_evidence
- actions
- verifications
- recommendations
- communication_messages
- audit_records

Do not add PCU, clusters, wallets, marketplace, staking, or blockchain compatibility layers.

## Phase 5 — Tenant-isolation testing

Use at least two real authenticated test actors and two organizations.

Required tests:
- Actor A can read A resources.
- Actor A cannot read B resources.
- Actor A cannot insert a B-owned resource.
- Actor A cannot update/delete B resources.
- Parent-child organization mismatch is rejected.
- Membership revocation immediately removes access.
- Webhook tenant spoofing fails.
- Background jobs cannot accidentally reuse another tenant's context.
- Ellie retrieval is tenant-scoped.
- Service-role access is never exposed to clients.

## Phase 6 — First operational vertical slice

Build the smallest demonstrable operator workflow:

Observation
→ Event
→ Situation
→ Recommendation
→ Authorized Work/Action
→ Verification

Use EPC and PAYGo as architectural tests, not separate products.

The first workflow must prove that the shared kernel works for materially different organizations.

## Phase 7 — Move integrations

Reconnect channels only after V2 tenant context exists.

Priority:
1. Web/operator UI
2. WhatsApp
3. Additional channels later

Every channel must resolve an Actor and organization context rather than treating a phone/chat identifier as authorization.

## Phase 8 — Ellie

Adapt existing Ellie interaction infrastructure.

Ellie should:
- receive bounded organizational context
- inspect authorized evidence
- produce recommendations
- request/emit structured intent where allowed

Ellie must not:
- bypass RLS
- select arbitrary tenant IDs
- authorize itself
- directly mutate authoritative state without an authorized action path

## Phase 9 — Legacy isolation

After V2 reaches a working pilot:
- mark V1 routes as legacy
- remove V1 routes from V2 navigation
- prevent new V2 imports of legacy modules
- move remaining V1 domain packages behind an explicit legacy boundary
- retain archived source until production decommissioning is complete

## Phase 10 — Retirement

Only after:
- V1 traffic is understood
- backups/snapshots exist
- external dependencies are migrated
- production integrations are migrated
- rollback is possible

then:
- disable legacy writes
- remove unreachable code
- archive V1 database
- remove obsolete deployment services
- delete legacy database objects according to a separately reviewed retirement plan

## Forbidden cleanup shortcut

Do not:
- globally replace SUPABASE_URL with V2 URL
- globally replace SUPABASE_SERVICE_KEY
- run V1 migrations against V2
- rename legacy tables into V2 names
- copy 70+ legacy tables into V2
- keep PCU/wallet/cluster concepts merely for compatibility
- make V2 depend on a legacy service just because it already exists
- delete code solely because it is old

## Definition of clean V2

A V2 build is clean when:

1. Its database is the V2 Supabase project.
2. Its tenant model is Organization + Membership + Actor.
3. Its authorization is permission-based and RLS-backed.
4. Its operational kernel is independent of V1 market concepts.
5. Its V2 application imports do not cross into legacy domain modules.
6. Its channels preserve tenant context.
7. Its background jobs preserve tenant context.
8. Its AI context is tenant-scoped.
9. Its tests prove cross-tenant isolation.
10. Legacy V1 can be removed without changing V2 domain semantics.

## Ordered implementation sequence

1. Finish repository dependency validation.
2. Commit V2 connection layer.
3. Add V2 tenant-context boundary.
4. Add V2 data-access layer.
5. Apply Migration 003 customer/site/asset.
6. Build authenticated tenant-isolation tests.
7. Implement evidence/events.
8. Implement situations/work/verification.
9. Adapt communication/WhatsApp.
10. Adapt Ellie.
11. Run EPC/PAYGo vertical slices.
12. Freeze V1.
13. Decommission legacy incrementally.

## Final principle

Clean the repository by **dependency boundaries**, not by file age.

Preserve the hard-won infrastructure.
Remove legacy domain dependence from the V2 path.
Do not make the new database inherit the old product.
