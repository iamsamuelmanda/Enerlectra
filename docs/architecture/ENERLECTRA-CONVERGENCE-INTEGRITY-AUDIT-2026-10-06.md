# Enerlectra Convergence Integrity Audit

**Date:** 2026-10-06  
**Branch:** `reconstruction/platform-identity-boundary`  
**Scope:** Legacy/V1 convergence, canonical runtime reachability, frontend/database boundary, and preservation of reusable capability logic.

## Executive conclusion

The convergence has **not regressed into an EPC/PAYGo split or a duplicated V2 domain**. The canonical database and active server composition root are substantially aligned with the intended Enerlectra platform.

However, convergence is **not complete**.

The remaining problem is not that the old logic exists. The remaining problem is that the repository still contains multiple legacy execution paths and the legacy `enerlectra-core` package remains a root dependency. Several old route/service modules directly import legacy core code and legacy Supabase clients even though they are no longer mounted by the canonical `server/src/index.ts`.

Therefore:

> **Do not delete the legacy logic yet. Do not promote it into the canonical kernel either. Prove reachability, preserve valuable algorithms/integrations, then retire or adapt each capability deliberately.**

## 1. What is canonical now

The active server composition root mounts only the canonical V2 operational surface:

- operational issues
- actions
- operations queue
- organization context
- customers/sites/assets
- verifications

The root server creates the canonical V2 Supabase service client and refuses to start without the V2 database configuration.

The canonical domain chain is:

```
Actor
 -> Membership
 -> Organization
 -> Customer/Site/Asset
 -> Observation/Event
 -> Situation
 -> Recommendation
 -> Work
 -> Action/Attempt
 -> Verification
 -> Audit
```

This is the correct convergence direction.

## 2. What the live security work proves

The live Supabase validation has already demonstrated:

- role/permission grants exist;
- authenticated organization membership is required;
- cross-tenant reads are blocked;
- forged organization reassignment is blocked;
- consequential actions require the correct authorization chain;
- Work execution respects trusted actor context;
- Action authorization precedes execution;
- multi-tenant operational flow succeeds.

The two-tenant fixture is a **security regression test**, not a product limitation. The schema remains organization-generic and can support many organizations.

## 3. Legacy domain convergence status

### KEEP

These should remain part of the platform:

- canonical identity/tenant boundary;
- organization operating context;
- customer/site/asset primitives;
- evidence/event infrastructure where it satisfies V2 semantics;
- situation/work/action/verification kernel;
- logging/metrics/observability;
- proven provider-security primitives;
- reusable meter validation/OCR/fraud algorithms after boundary adaptation.

### ADAPT

These contain useful business logic but currently use legacy persistence or identity assumptions:

- meter reading validation;
- OCR;
- manual reading workflows;
- tariff/economic calculations;
- Lenco/provider integration;
- payment orchestration;
- webhook verification/deduplication;
- suppliers;
- communication/channel adapters;
- customer/asset legacy services;
- selected ledger primitives.

The algorithm or integration should survive; its authorization and persistence boundary must change.

### ISOLATE

These remain potentially valuable but are not part of the minimum operational kernel:

- PCU issuance/redemption;
- wallets;
- marketplace;
- matching/trading;
- settlement;
- treasury;
- cluster economics;
- ownership snapshots;
- protocol/staking;
- simulation;
- Telegram legacy workflows.

Isolation is deliberate. It is not a claim that the underlying intellectual property has no value.

### RETIRE

Retirement should apply only after reachability and deployment checks prove the path is unused:

- legacy authorization resolvers;
- `default-org` semantics;
- cluster-based authorization;
- obsolete duplicate authentication paths;
- historical protocol/runtime routes that have no active consumer.

## 4. Critical repository finding

The root `package.json` still declares:

```json
"enerlectra-core": "file:./enerlectra-core"
```

This means the legacy package remains inside the root dependency graph even though the canonical server does not need the whole package.

More importantly, legacy server modules still import it directly, including:

- `server/src/routes/readings.ts`
- `server/src/routes/ledger.ts`
- `server/src/routes/staking.ts`
- `server/src/routes/webhooks.ts`
- `server/src/services/payment-orchestrator.ts`
- `server/src/services/settlement*.ts`
- `server/src/services/pcuMinting.ts`
- `server/src/services/matchingEngine.ts`
- `server/src/services/validation.ts`
- `server/src/services/tariffSync.ts`
- related ownership/contribution/distribution modules.

These files are not mounted by the canonical server composition root, which is the important containment boundary.

But their existence means the repository is not yet cleanly separated.

### Required next proof

For every legacy-importing module:

1. Determine whether it is imported by the canonical runtime.
2. Determine whether it is imported by tests/build scripts/jobs/deployment.
3. Determine whether it is externally invoked through a route that is no longer mounted.
4. Determine whether it owns reusable business logic.
5. Assign KEEP/ADAPT/ISOLATE/RETIRE.
6. Only then remove or relocate it.

## 5. Frontend convergence finding

The router currently points to the V2 surface:

- `/`
- `/signin`
- `/onboarding`
- `/workspace`

This is correct.

However, substantial V1 frontend code remains in the repository.

The old frontend still contains direct legacy Supabase usage and product concepts such as:

- clusters/communities;
- wallet;
- marketplace/trading;
- contribution/economic views;
- legacy meter-reading data;
- protocol surfaces.

The legacy `client/src/lib/supabase.ts` is therefore **not allowed to become the V2 client by repointing its URL**.

The V2 browser boundary is correctly separate:

```
V2 browser Supabase client
 -> authenticated session
 -> V2 API
 -> canonical server
 -> canonical V2 Supabase
```

The V1 client should be progressively retired or isolated rather than silently redirected.

## 6. Important legacy logic that must not be lost

The repository contains real reusable IP that should survive the convergence.

### Meter validation

The existing validation logic includes:

- OCR confidence;
- absolute kWh bounds;
- duplicate detection;
- meter-specific delta limits;
- rollover detection;
- reset detection;
- visual fingerprinting;
- fraud signals;
- threshold handling.

The defect is not the algorithm.

The defect is its old lookup boundary:

```
user_id + cluster_id + meter_type
```

The target is:

```
organization
 + site
 + asset/meter
 + observation history
```

Therefore the correct action is **ADAPT**, not rewrite/delete.

### Payments

The existing payment layer contains valuable provider concerns:

- idempotency;
- signatures;
- timestamp freshness;
- provider references;
- payout transitions;
- webhook deduplication;
- phone normalization;
- exchange rates.

Those concerns should be preserved as bounded financial/integration capabilities.

What must disappear from their authorization path is the assumption:

```
user -> PCU balance -> cluster membership
```

## 7. What has NOT happened

The following undesirable convergence failures were **not found**:

### No EPC/PAYGo domain duplication

There is no canonical split such as:

```
EPC customers
PAYGo customers
EPC work
PAYGo work
EPC assets
PAYGo assets
```

The shared operational entities remain generic.

### No business-model authorization

Operating context and business-model descriptors are not being used as actor permissions.

### No two-tenant product limit

The database model uses organization-scoped tenancy. The two-tenant test is a security fixture.

### No wholesale legacy-schema promotion

The V2 schema does not reproduce clusters, PCU, wallets, marketplace, staking, or settlement as universal operational primitives.

## 8. Current architecture boundary

The current state should be understood as:

```
                    ENERLECTRA
                        |
        +---------------+----------------+
        |                                |
 CANONICAL PLATFORM              LEGACY CAPABILITIES
        |                                |
 Identity / tenancy               Meter algorithms
 Organization context             Payments
 Customer/Site/Asset              OCR/fraud
 Evidence/Event                   Settlement
 Situation/Work                   PCU/wallet
 Action/Verification              Marketplace
 Audit                             Trading/protocol
        |                                |
        +---------- controlled ----------+
                   adaptation
```

The objective is eventually one runtime, not two products.

But controlled isolation is preferable to premature deletion.

## 9. Frontend/database contract

The frontend is now capable of talking to the canonical backend through the V2 API layer.

The V2 API obtains the authenticated Supabase session token and sends it as a bearer token.

The current V2 resource APIs return organization-scoped customer/site/asset data and capability information.

Therefore the console is not merely a static mock. It has a real integration path.

However, the Figma console must still be reconciled against this implementation before we call the frontend complete.

## 10. Immediate next gates

### Gate A — dependency reachability

Produce a definitive list of all legacy modules reachable from:

- canonical server;
- frontend build;
- test suite;
- scheduled jobs;
- deployment entrypoints;
- integration adapters.

### Gate B — capability preservation map

For each valuable legacy subsystem:

```
legacy capability
 -> reusable logic
 -> required V2 domain
 -> required V2 persistence
 -> required authorization
 -> target owner/module
```

### Gate C — frontend convergence

Map:

```
Figma console
 -> route
 -> component
 -> API
 -> domain resource
 -> Supabase table/RPC
 -> authorization
```

No console feature should be implemented without this chain being explicit.

### Gate D — legacy retirement

Only after A-C:

- remove unreachable V1 runtime imports;
- remove obsolete V1 client routes;
- remove redundant Supabase clients;
- remove dead package dependencies;
- preserve isolated capabilities in explicit bounded modules.

## 11. Decision

**The convergence should continue. It should not be rolled back.**

But the next phase is **not feature expansion**.

The next phase is:

> **prove the boundary, preserve the valuable logic, remove duplicate runtime paths, then implement the Figma console against the resulting canonical contract.**

This audit does not authorize destructive cleanup by itself.
