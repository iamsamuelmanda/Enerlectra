# Enerlectra Codebase Forensic Audit

**Status:** Active convergence audit  
**Branch:** `reconstruction/platform-identity-boundary`  
**Date:** 2026-10-05

## Purpose

This is the repository X-ray for converging the existing Enerlectra implementation onto the reconstructed identity, tenancy, authorization, and operational-kernel architecture.

This is **not** a V1/V2 product split. The target is one Enerlectra codebase, one server runtime, one client runtime, and one canonical Supabase boundary.

## Target architecture

```text
Channel / Web / API
        ↓
Authenticated identity
        ↓
Actor
        ↓
Active Membership
        ↓
Organization tenant
        ↓
Operating model / capabilities / policy
        ↓
Customer → Site → Asset
        ↓
Observation / Evidence
        ↓
Event
        ↓
Situation
        ↓
Recommendation
        ↓
Authorization
        ↓
Work
        ↓
Action
        ↓
Attempt / Result
        ↓
Verification
```

The existing Enerlectra capabilities are evaluated against this boundary rather than discarded because they predate the reconstruction.

## Executive findings

### 1. The reconstructed boundary is the correct foundation

The following are now the canonical security primitives:

- Auth User → Actor → Membership → Organization.
- Organization is the tenant boundary.
- Channel identity identifies an actor; it does not grant authorization.
- Client-supplied organization identifiers are claims only and must be verified against membership.
- RLS is a database enforcement boundary.
- Consequential Action execution remains separate from Recommendation and Authorization.
- Unknown execution is a first-class safety state.
- Creator/provenance is not equivalent to ownership.

### 2. The active server is now V2-boundary-first, but capability-incomplete

The reconstruction branch's `server/src/index.ts` no longer imports or mounts the old cluster, marketplace, staking, ledger, settlement and legacy runtime routes. It requires the V2 Supabase environment and mounts the operational-issue and Action boundaries.

This is the correct direction.

However, this means useful existing Enerlectra capabilities are currently **unreachable from the active runtime**. They must be reconciled, not forgotten.

### 3. Existing business logic contains substantial reusable value

The legacy server contains real functionality for:

- meter readings and validation;
- production/consumption reconciliation;
- payment/provider integration;
- payout/settlement processing;
- ledger operations;
- supplier workflows;
- distribution;
- WhatsApp;
- telemetry/integration webhooks;
- tariff synchronization;
- financial and economic experiments.

These are not automatically obsolete.

The correct treatment is to trace each capability and move useful domain logic behind the canonical identity/organization boundary.

### 4. Some legacy modules are fundamentally incompatible with the target

Examples include code that:

- accepts arbitrary `userId` from request bodies;
- trusts `cluster_id` as the authorization boundary;
- uses `cluster_members` instead of organization membership;
- uses legacy `SUPABASE_*` credentials;
- writes to legacy economic tables without tenant authorization;
- exposes data by `/by-user/:userId`;
- contains `default-org` assumptions;
- treats WhatsApp phone identity as authorization;
- allows unauthenticated marketplace reads across clusters;
- performs financial/economic operations without the reconstructed organization boundary.

These implementations must be refactored or retired even when their underlying business capability survives.

## Capability disposition

| Capability | Current implementation | Value | Main defect | Disposition |
|---|---|---:|---|---|
| Identity / tenancy | reconstructed platform | Critical | none material in current gate | KEEP / CANONICAL |
| Organizations / membership / roles | reconstructed Supabase | Critical | browser lifecycle still incomplete | KEEP / COMPLETE |
| Operational issue | new service + RPC | Critical | limited first-slice UX | KEEP |
| Work | reconstructed schema | Critical | UI still thin | KEEP |
| Action / attempts | reconstructed schema + service | Critical | broader domain integration pending | KEEP |
| Verification | reconstructed architecture | Critical | not yet full product surface | COMPLETE NEXT |
| Customer / site / asset | reconstructed schema | Critical | CRUD/workspace surfaces incomplete | COMPLETE NEXT |
| WhatsApp | existing adapter | High | legacy identity/context path | ADAPT |
| Meter readings | existing route + validation + reconciliation | High | cluster/user/legacy DB boundary | ADAPT |
| Payment provider integration | existing Lenco/payment code | High | legacy financial model / identity boundary | ADAPT / ISOLATE |
| Settlement | existing engine/routes/jobs | Medium/High | cluster/economic assumptions | ISOLATE, then selectively ADAPT |
| Ledger | existing double-entry logic | Potentially High | PCU/user-account model and unsafe user IDs | ISOLATE; preserve reusable accounting primitives |
| Supplier workflow | existing route | Medium | tenant/authorization model unknown | ADAPT after trace |
| Distribution | existing cluster economics | Low/Medium | cluster ownership model | ISOLATE |
| Marketplace | existing PCU trading | Low for current kernel | economic model explicitly deferred | ISOLATE |
| Staking | existing PCU staking | Low for current kernel | unrelated to current operational kernel | RETIRE / ISOLATE |
| PCU minting | existing economic primitive | Low for current kernel | tied to legacy cluster/PCU model | ISOLATE |
| Cluster ownership | existing | Low | conflicts with Organization tenant model | RETIRE from active runtime |
| Protocol oracle | existing | Low | legacy protocol/global-state surface | RETIRE from active product |
| Simulation | existing | TBD | no validated kernel dependency | ISOLATE |
| Tariff sync | existing | TBD | no current bounded workflow | ISOLATE |
| PostHog / metrics | infrastructure | High | none material | KEEP |
| Legacy Telegram kernel | existing | Low currently | legacy identity and command vocabulary | ISOLATE |

## Route-level forensic findings

### Readings

Existing flow:

`user → cluster_members → meter_readings → PCU mint → settlement`

This is valuable domain logic but the boundary is wrong.

Target:

`Actor → Membership → Organization → Observation → Event → bounded reading/energy capability`

The reading math and validation should be preserved where correct. Cluster membership must not remain the authorization primitive.

### Payments

The existing payment code contains provider integration, verification, webhook handling and payout logic.

Preserve the provider adapters and idempotency/security mechanics where sound.

Do not carry forward:

- arbitrary caller-selected user IDs;
- legacy settlement ownership;
- direct financial writes outside organization context;
- implicit cluster ownership.

### Settlement

Settlement is explicitly outside the initial operational kernel.

Do not delete the useful computation/provider mechanics prematurely. Quarantine the legacy cluster-dependent execution path and extract reusable bounded financial settlement logic only when a validated Enerlectra workflow requires it.

### Ledger

The existing LedgerService/double-entry logic may be valuable infrastructure.

The current route-level contract is unsafe because callers supply `senderId` and `receiverId`.

The accounting engine should survive independently if useful; the API boundary must derive the actor/organization from authenticated context and resolve permitted accounts internally.

### Marketplace / staking / PCU

These represent the old economic product model rather than the reconstructed operational kernel.

They should not be allowed back into the active server simply to restore feature parity.

Preserve useful code in isolated history/capability areas until dependency and product decisions are final.

## Core package

The current `enerlectra-core` package is mixed.

The following infrastructure remains useful:

- event contracts;
- correlation/causation metadata;
- service registry;
- command bus infrastructure where bounded commands justify it;
- message routing abstractions;
- communication adapters;
- intelligence concepts.

The old PCU, cluster, token, redemption and legacy meter-reading handlers must not be registered into the canonical kernel.

The current reconstruction has already removed those registrations. That is correct.

The old WhatsApp handler is intentionally fail-closed and must remain so until a real channel identity adapter resolves:

`channel identity → actor → membership → organization`.

## Client

The current active client is a single router, not a second frontend.

It currently exposes:

- landing;
- sign-in/sign-up;
- onboarding;
- a thin operational workspace.

The old cluster/trading/wallet UI is not active in the router.

The next client work is not to recreate the old dashboard. It is to expose the actual canonical operational capabilities:

- organization context;
- customer/site/asset context;
- situations;
- work;
- actions;
- verification;
- bounded communication;
- operational history.

## Critical defects to resolve during convergence

1. Preserve useful legacy domain logic without preserving legacy authorization boundaries.
2. Eliminate duplicate implementations of the same capability.
3. Ensure every tenant-scoped server operation resolves Actor → Membership → Organization.
4. Remove user/cluster IDs as substitutes for organization authorization.
5. Keep service-role credentials server-only.
6. Make external webhooks establish trusted provider identity and then resolve organization context through a canonical mapping.
7. Prevent old background jobs from becoming hidden alternate runtimes.
8. Trace all environment-variable consumers before removing legacy configuration.
9. Trace all legacy table consumers before dropping database objects.
10. Remove permanent V2 naming once the reconstruction is the canonical Enerlectra architecture.

## Safe convergence sequence

### Phase 1 — Forensic inventory
- route inventory;
- service inventory;
- core handler inventory;
- client consumer inventory;
- database-table consumer inventory;
- environment/deployment inventory.

### Phase 2 — Boundary refactoring
For each valuable capability:
- preserve domain computation;
- replace identity lookup;
- derive organization from membership;
- enforce permissions;
- add tenant-safe persistence;
- preserve idempotency;
- add authenticated integration tests.

### Phase 3 — Canonical consolidation
- one implementation per capability;
- remove duplicate routes/services;
- remove dead adapters;
- eliminate legacy runtime imports;
- remove alternate database clients.

### Phase 4 — Product projection
- expose the resulting capabilities through the single client;
- remove V2 preview/version language;
- connect the real operational workflows.

### Phase 5 — Retirement
Only after reachability is zero and production dependencies are verified:
- remove isolated legacy modules;
- remove obsolete environment variables;
- remove obsolete database objects/migrations only when safe;
- archive historical economic experiments.

## Current conclusion

Enerlectra is **not empty behind the reconstruction**.

It has a substantial capability base. The reconstruction correctly fixed the architectural boundary but intentionally narrowed the active runtime while that boundary was being proven.

The job now is therefore:

> **converge the capability base onto the proven boundary.**

Not:

> build a second Enerlectra.

And not:

> restore the old runtime unchanged.

The desired end state is one Enerlectra in which the useful parts of the old implementation become bounded capabilities behind the same canonical identity, tenancy, authorization, operational and audit model.
