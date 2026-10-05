# Enerlectra Codebase X-Ray — Capability and Boundary Map

Date: 2026-10-05
Branch: reconstruction/platform-identity-boundary

## Purpose

This is the forensic map of the existing Enerlectra codebase after the identity/tenant reconstruction. It answers four questions for every significant subsystem:

1. What does the code appear to do?
2. Does it contain reusable Enerlectra business logic?
3. Does its current authorization/data boundary fit the canonical architecture?
4. What should happen to it?

The four dispositions are:

- **KEEP** — already aligned with the canonical platform.
- **ADAPT** — valuable business capability; preserve the logic but refactor its boundary, identity model, persistence, or API.
- **ISOLATE** — potentially valuable/interesting but not part of the operational kernel yet. Keep reachable only through an explicit boundary while its product role is decided.
- **RETIRE** — obsolete or incompatible enough that it should not remain an active runtime capability. Delete only after reachability/dependency proof.

## Canonical target

```
Authenticated identity
        ↓
Actor
        ↓
Active organization membership
        ↓
Organization tenant
        ↓
Customer → Site → Asset
        ↓
Observation → Event → Situation
        ↓
Work → Action → Attempt
        ↓
Verification / financial consequence / audit
```

The old `cluster_id`, `user_id`, phone number, or client-supplied role must not be used as a substitute for this authorization chain.

---

# 1. Runtime composition

| File | What it contains | Disposition | Action |
|---|---|---|---|
| `server/src/index.ts` | Express composition root, canonical Supabase client, health/info/metrics, canonical operational routes | **KEEP** | Remain the only production server entry point. Add adapted capabilities here only after boundary review. |
| `server/src/index.update.txt` | Historical/manual update instructions | **REMOVE** | Delete after confirming no tooling references it. |
| `server/src/platform/*` | Identity/tenant reconstruction | **KEEP / CANONICAL** | This is the architectural spine. |

## Platform layer

The platform directory is the correct home for:

- authenticated identity resolution
- actor resolution
- organization membership
- permissions
- tenant context
- command authorization
- channel identity resolution

It should remain capability-neutral.

---

# 2. Canonical operational kernel

| File | Function | Disposition |
|---|---|---|
| `server/src/routes/customerOperationalIssues.ts` | Creates operational issue and delegates atomic Observation → Event → Situation → Work creation | **KEEP** |
| `server/src/services/customerOperationalIssues.ts` | Service wrapper around canonical issue creation | **KEEP** |
| `server/src/routes/actions.ts` | Action creation, authorization, transition, human attempts | **KEEP** |
| `server/src/services/actions.ts` | Action/work execution logic | **KEEP** |
| `server/src/routes/lifecycle.ts` | Old cluster settlement lifecycle state machine | **ADAPT / ISOLATE** |
| `server/src/services/settlementStateSupabase.ts` | Settlement-state persistence | **ISOLATE**, unless mapped to organization/work lifecycle |

The operational kernel is the strongest current architectural code.

---

# 3. Meter readings — first major capability to converge

## Server

| File | Role | Disposition |
|---|---|---|
| `server/src/routes/readings.ts` | Authenticated reading ingestion; validates readings, persists readings, invokes PCU/reconciliation | **ADAPT** |
| `server/src/services/validation.ts` | Server adapter/re-export for reading validation | **ADAPT** |
| `server/src/services/pcuMinting.ts` | Converts eligible export readings into PCU | **ISOLATE → ADAPT if PCU survives product review** |
| `server/src/services/contributionsSupabase.ts` | Contribution persistence/retrieval | **ADAPT / ISOLATE** |

## Core

| File | Role | Disposition |
|---|---|---|
| `enerlectra-core/src/core/services/validation.ts` | Meter validation: bounds, confidence, duplicate detection, rollover, reset detection, delta limits, visual fingerprint/fraud signals | **KEEP LOGIC / ADAPT BOUNDARY** |
| `enerlectra-core/src/core/services/manual-reading.ts` | Manual reading workflow | **ADAPT** |
| `enerlectra-core/src/core/services/ocr.ts` | OCR pipeline and meter extraction | **KEEP / ADAPT** |
| `enerlectra-core/src/core/services/imageFingerprint.ts` | Image fingerprint and visual comparison | **KEEP** |
| `enerlectra-core/src/core/services/metrics.ts` | Meter/system metrics | **KEEP / REVIEW TENANCY** |
| `enerlectra-core/src/core/services/tariff-calculator.ts` | Tariff/economic calculation | **ADAPT** |
| `enerlectra-core/src/core/services/period.ts` | Period utilities | **KEEP** |

### Critical finding

The validation algorithm contains real IP:

- OCR confidence threshold
- absolute kWh bounds
- duplicate window
- meter-specific delta limits
- rollover detection
- possible-reset detection
- reset markers
- visual fingerprint comparison
- fraud signals
- fraud alert thresholds

This should **not** be rewritten from scratch.

Its problem is that it currently queries `meter_readings` by:

`user_id + cluster_id + meter_type`

The canonical replacement is resource-scoped:

`organization + site + asset/meter + observation history`

The algorithm survives; the authority/data access layer changes.

---

# 4. Payments / Lenco

## Server

| File | Role | Disposition |
|---|---|---|
| `server/src/routes/payments.ts` | PCU redemption, Lenco payout, idempotency, exchange rate, webhook processing, payout batch | **ADAPT** |
| `server/src/services/lencoService.ts` | Lenco provider integration | **KEEP / ADAPT** |
| `server/src/services/settlement.ts` | Mobile-money payout execution | **ADAPT** |
| `server/src/services/batchPayoutProcessor.ts` | Batch payout processing | **ADAPT** |
| `server/src/services/payment-orchestrator.ts` | Payment orchestration abstraction | **KEEP / ADAPT** |
| `server/src/routes/webhooks.ts` | MTN/Airtel/Lenco webhook adapter | **ADAPT** |

### Valuable existing behaviour

The payment code contains:

- Lenco payout invocation
- idempotency-key handling
- signature verification
- timestamp freshness checking
- provider reference tracking
- payout status transitions
- webhook deduplication
- exchange-rate retrieval
- phone normalization
- transaction recording

These are valuable production concerns.

### Boundary problem

The current redemption flow still determines ownership using:

`user_id → pcu_balances → cluster_members → cluster_id`

That must become:

`actor → organization membership → tenant wallet/account → financial transaction`

Do not delete the Lenco integration.

---

# 5. Ledger / accounting

| File | Role | Disposition |
|---|---|---|
| `server/src/routes/ledger.ts` | PCU transfer/double-entry API | **ADAPT / ISOLATE** |
| `server/src/routes/ownershipLedger.ts` | PCU ownership aggregation | **ISOLATE** |
| `enerlectra-core/src/lib/ledgerService.ts` | Ledger primitives | **KEEP PRIMITIVES / ADAPT** |
| `enerlectra-core/src/core/services/balance.service.ts` | Balance operations | **ADAPT** |
| `enerlectra-core/src/core/services/history.service.ts` | Historical/account activity | **ADAPT** |

The double-entry concept is valuable. The current user/PCU wallet boundary is not canonical.

Financial records should eventually have an explicit tenant/account model and immutable audit trail.

---

# 6. Settlement

| File | Role | Disposition |
|---|---|---|
| `server/src/routes/settlement.ts` | Generate settlement instructions and retrieve settlement state/results | **ISOLATE → ADAPT selectively** |
| `server/src/services/clusterSettlementEngine.ts` | Cluster settlement calculations | **ISOLATE** |
| `server/src/services/settlementSupabase.ts` | Settlement persistence | **ISOLATE / ADAPT** |
| `server/src/services/settlementStateSupabase.ts` | Settlement state persistence | **ISOLATE** |
| `server/src/services/distributionSupabase.ts` | Distribution persistence | **ISOLATE** |
| `server/src/routes/distribution.ts` | Cluster distribution simulation | **ISOLATE** |
| `server/src/routes/distributionFinalize.ts` | Finalizes cluster distribution | **ISOLATE** |
| `enerlectra-core/src/core/services/settlement.ts` | Settlement execution/calculation logic | **ISOLATE / selectively ADAPT** |
| `enerlectra-core/src/core/services/settlementDecision.ts` | Settlement decision logic | **ISOLATE** |
| `enerlectra-core/src/core/services/settlementScore.ts` | Settlement scoring | **ISOLATE** |

The settlement mathematics may be valuable. The cluster lifecycle is not an acceptable tenant boundary.

---

# 7. PCU / token economics

| File | Role | Disposition |
|---|---|---|
| `server/src/services/pcuMinting.ts` | Mint PCU from energy export | **ISOLATE** |
| `enerlectra-core/src/core/services/pcuMinting.ts` | PCU issuance logic | **ISOLATE** |
| `enerlectra-core/src/core/services/pcuTransfer.ts` | PCU transfer | **ISOLATE** |
| `enerlectra-core/src/core/services/redemption.ts` | PCU redemption | **ISOLATE** |
| `enerlectra-core/src/core/services/exchange.ts` | Exchange/economic conversion | **ADAPT / ISOLATE** |

The screenshot confirms this is a real subsystem, not a stray label.

It needs a deliberate product decision before being made part of the operational kernel.

---

# 8. Clusters

| File | Disposition |
|---|---|
| `server/src/routes/clusters.ts` | **RETIRE FROM ACTIVE AUTHORIZATION / ADAPT AS DOMAIN CONCEPT IF NEEDED** |
| `enerlectra-core/src/core/services/cluster.service.ts` | **ISOLATE** |
| `enerlectra-core/src/core/services/cluster.ts` | **ISOLATE** |
| `enerlectra-core/src/core/services/resolve-user.ts` | **RETIRE/REPLACE** |
| `client/src/features/clusters/*` | **ADAPT UI CONCEPTS INTO ORGANIZATION/SITE/ASSET** |

A cluster can potentially survive as a business concept, but it cannot remain the security boundary.

---

# 9. Contributions / ownership

| File | Disposition |
|---|---|
| `server/src/routes/contributions.ts` | **ADAPT / ISOLATE** |
| `server/src/routes/ownership.ts` | **ISOLATE** |
| `server/src/routes/ownershipLedger.ts` | **ISOLATE** |
| `server/src/services/contributionsSupabase.ts` | **ADAPT** |
| `enerlectra-core/src/services/aggregateOwnership.ts` | **ISOLATE** |
| `client/src/features/contributions/*` | **ISOLATE / ADAPT** |

The financial/economic ownership model may contain reusable calculations, but its current cluster/user assumptions must not leak into canonical tenancy.

---

# 10. Marketplace

| File | Disposition |
|---|---|
| `server/src/routes/marketplace.ts` | **ISOLATE** |
| `server/src/services/matchingEngine.ts` | **ISOLATE** |
| `client/src/features/trading/*` | **ISOLATE** |

The matching engine is potentially useful IP. It should not currently be allowed to define the platform architecture.

---

# 11. Staking / protocol

| File | Disposition |
|---|---|
| `server/src/routes/staking.ts` | **ISOLATE / RETIRE** |
| `server/src/routes/protocol.ts` | **RETIRE FROM OPERATIONAL KERNEL** |
| `server/src/services/staking.ts` | **ISOLATE / RETIRE** |
| `client/src/features/protocol/*` | **ISOLATE** |

These are protocol/economic experiments rather than core operational infrastructure.

---

# 12. Suppliers

| File | Disposition |
|---|---|
| `server/src/routes/suppliers.ts` | **ADAPT** |
| supplier JSON storage inside the route | **REMOVE AFTER MIGRATION** |

Supplier workflows fit naturally into the canonical Work/Action model.

The filesystem JSON persistence does not belong in production multi-tenant infrastructure.

---

# 13. Simulation

| File | Disposition |
|---|---|
| `server/src/routes/simulation.ts` | **ISOLATE** |
| `server/src/controllers/simulation.controller.ts` | **ISOLATE** |
| `client/src/features/simulation/*` | **ISOLATE** |

Useful analytical capability, but not part of the operational authorization kernel.

---

# 14. Cron / asynchronous processing

| File | Role | Disposition |
|---|---|---|
| `server/src/jobs/matchingCron.ts` | Marketplace matching | **ISOLATE** |
| `server/src/jobs/payoutProcessorCron.ts` | Batch payouts | **ADAPT** |
| `server/src/jobs/settlementCron.ts` | Settlement processing | **ISOLATE / ADAPT later** |

Jobs must execute with explicit organization/account context or use carefully scoped service-role operations with auditable provenance.

---

# 15. Authentication / identity

| File | Disposition |
|---|---|
| `server/src/middleware/auth.ts` | **ADAPT / KEEP only where compatible** |
| `server/src/middleware/csrf.ts` | **KEEP / REVIEW** |
| `client/src/features/auth/*` | **KEEP / CONSOLIDATE** |
| `client/src/pages/SignIn.tsx` | **CONSOLIDATE** |
| `client/src/pages/SignUp.tsx` | **CONSOLIDATE** |
| `client/src/pages/ForgotPassword.tsx` | **KEEP / CONSOLIDATE** |
| `client/src/pages/ResetPassword.tsx` | **KEEP / CONSOLIDATE** |
| `client/src/pages/V2SignIn.tsx` | **RENAME/CONSOLIDATE INTO CANONICAL SIGN-IN** |
| `client/src/pages/V2Onboarding.tsx` | **RENAME/CONSOLIDATE** |
| `client/src/pages/V2Home.tsx` | **RENAME/CONSOLIDATE** |
| `client/src/pages/V2Workspace.tsx` | **RENAME/CONSOLIDATE** |

There must ultimately be one authentication experience, not old and new authentication products.

---

# 16. Existing client product surface

The client currently contains:

```
admin
auth
campaign
clusters
contributions
energy
grid
protocol
simulation
trading
```

Disposition:

| Client feature | Disposition |
|---|---|
| admin | **KEEP / SECURITY REVIEW** |
| auth | **KEEP / CONSOLIDATE** |
| campaign | **REVIEW** |
| clusters | **ADAPT to organization/site/asset concepts** |
| contributions | **ISOLATE / ADAPT** |
| energy | **HIGH PRIORITY ADAPT** |
| grid | **ADAPT** |
| protocol | **ISOLATE** |
| simulation | **ISOLATE** |
| trading | **ISOLATE** |

The client has substantial existing UI IP. It should not be deleted because the new workspace is currently smaller.

---

# 17. Core infrastructure services

| File | Disposition |
|---|---|
| `logger.ts` | **KEEP** |
| `rate-limiter.ts` | **KEEP / REVIEW** |
| `metrics.ts` | **KEEP** |
| `identity.ts` | **KEEP / CONSOLIDATE** |
| `operator.service.ts` | **ADAPT** |
| `role.service.ts` | **REVIEW against canonical membership roles** |
| `dashboard.ts` | **ADAPT** |
| `installer.service.ts` | **REVIEW** |
| `bot-state.ts` | **ISOLATE** |
| `resolve-user.ts` | **RETIRE/REPLACE** |

The canonical membership/permission system must become the only authorization source.

---

# 18. WhatsApp / channel architecture

Existing webhook and bot infrastructure contains reusable provider handling.

The correct model is:

```
WhatsApp phone/channel identity
        ↓
channel_identity
        ↓
actor
        ↓
active membership
        ↓
organization
```

A phone number must never itself become authorization.

Current disposition:

**ADAPT, fail closed until canonical channel identity resolution is implemented.**

---

# 19. Legacy data/storage smells found by the X-ray

These are not merely style problems:

- `SUPABASE_URL + SUPABASE_SERVICE_KEY` legacy clients
- `user_id` supplied directly by clients
- `cluster_id` as authorization boundary
- `cluster_members` used for authority
- filesystem JSON state under `server/data`
- direct PCU wallet mutation
- payment records without organization boundary
- old cluster settlement state machines
- duplicated payment/settlement implementations
- multiple authentication paths
- old Telegram-centric core services
- channel identity treated as user identity
- protocol economics mixed with operational workflows

These are the areas where the X-ray has found architectural debt rather than merely old code.

---

# 20. The dependency/convergence order

The correct sequence is now:

### Phase A — Canonical foundation
Already substantially completed.

- identity
- actor
- membership
- organization
- tenant isolation
- permissions
- onboarding
- work/action boundaries

### Phase B — Highest-value operational capability

**1. Readings**

Preserve:

- OCR
- validation
- duplicate detection
- rollover
- fraud scoring
- image fingerprints
- energy calculations

Replace:

- user/cluster authorization
- legacy meter persistence
- direct cluster lookup

Target:

`observation → event → situation/work where operationally relevant`

### Phase C — Money

**2. Lenco / payments**

Preserve:

- provider adapter
- signatures
- idempotency
- payout state
- webhook processing

Replace:

- user/cluster wallet ownership
- tenant boundary
- transaction authorization

### Phase D — Channels

**3. WhatsApp**

Preserve:

- provider integration
- templates
- inbound/outbound handling

Replace:

- phone-as-authority
- legacy user resolution

### Phase E — Financial/economic subsystems

**4. Ledger**

Extract the valid accounting primitives.

**5. Settlement**

Extract the valid calculation/reconciliation logic.

**6. PCU**

Decide whether it is a core Enerlectra product primitive or an experimental economic layer.

### Phase F — Secondary capabilities

- suppliers
- marketplace
- simulation
- protocol/staking
- distribution
- legacy cluster UI

Only graduate them when their role in the canonical product is proven.

---

# 21. What must NOT happen

Do not create:

- `server/v2`
- `server/legacy`
- `server/new`
- `client/v2`
- `client/legacy`
- duplicate reading services
- duplicate payment services
- duplicate ledger implementations

The final system must have one implementation of each capability.

Historical reconstruction documents may retain the word V2 because they document the reconstruction process. Runtime/product naming should not.

---

# 22. Current X-ray conclusion

Enerlectra is not a small application with a new login system attached.

It is a substantial prototype/platform containing:

- operational workflows
- energy measurement
- OCR
- fraud detection
- mobile-money integration
- financial primitives
- settlement
- token/economic experiments
- marketplace/matching
- supplier workflows
- channel integrations
- analytics/telemetry

The architectural reconstruction therefore has the correct objective:

**preserve the valuable domain IP while replacing the unsafe boundaries around it.**

The highest-value next implementation is the reading capability because it connects the existing energy-measurement IP directly to the new canonical Observation/Event/Situation/Work model.

The second is payments because it connects the operational layer to real financial execution.

Only after those two are reconciled should the older economic/protocol subsystems be allowed back into the active runtime.


---

# 23. X-ray execution update — canonical readings slice

The first capability has now moved from analysis into implementation.

### Committed

- `supabase/v2/migrations/034_canonical_meter_readings.sql`
- `server/src/routes/readings.ts`
- `enerlectra-core/src/core/services/validation.ts`
- `server/src/index.ts`

### Live database

Migration 034 is applied to the canonical Supabase project.

The live database now contains:

- `meter_readings`
- `fraud_signals`
- `fraud_alerts`

All three are tenant-scoped by `organization_id`.

`meter_readings` also links directly to:

- actor
- customer
- site
- asset
- canonical observation

The old `user_id`, `cluster_id`, and `cluster_members` boundary is absent.

### Runtime flow

The canonical reading endpoint now follows:

```
Bearer identity
    ↓
TenantContextResolver
    ↓
active actor + membership + organization
    ↓
organization-scoped asset lookup
    ↓
organization/asset/meter history
    ↓
existing Enerlectra validation algorithm
    ↓
fraud evidence (tenant-scoped)
    ↓
canonical Observation
    ↓
canonical meter_reading capability record
```

The validation algorithm was not duplicated. It was extended so canonical callers can provide tenant/resource-scoped history and a fraud-signal sink. Legacy callers can still compile while they are being retired, but the active canonical route does not query the legacy schema.

### Important remaining correctness gate

The current implementation inserts the Observation and meter capability record as two writes. Before this capability is treated as production-complete, those writes should be made atomic through a database transaction/RPC, and the canonical reading route needs an authenticated integration test covering:

1. authenticated member can write to an asset in their organization;
2. member cannot write to an asset in another organization;
3. inactive asset is rejected;
4. duplicate `reading_key` is idempotent;
5. validation uses only the target asset's history;
6. fraud signals remain tenant-scoped;
7. Observation and reading record cannot diverge.

PCU minting is intentionally **not** reconnected yet. The reading capability must first be proven independently of the old PCU wallet model.


---

# 24. ICP-first correction

The repository X-ray is now governed by an additional test:

> Existing code does not earn a place in the active product merely because it is sophisticated or already implemented.

The first implementation subset is the smallest shared operational kernel proven by the EPC and PAYGo validation slices. The documentation explicitly excludes PCU, wallets, P2P trading, marketplace, staking, blockchain settlement, universal financial ledger, and telemetry dependency from that first slice.

## Active product kernel

The current product value proposition is operational intelligence for energy-facing businesses:

**observe → understand → prioritize → recommend → authorize → work → verify**

The shared primitives are:

- Organization
- Actor / Membership
- Customer
- Site
- Asset
- Observation / Evidence
- Event
- Situation
- Recommendation
- Work
- Action
- Verification
- Communication
- Audit

## Capability decision rules

A capability should enter the active product only when:

1. a target energy-business workflow needs it;
2. the workflow creates measurable operational value;
3. it can operate safely inside the organization boundary;
4. its behavior can vary through capability/policy configuration rather than creating a separate product;
5. the pilot/ICP evidence is strong enough to justify the implementation cost.

## Current capability posture

| Capability | Current product posture | Reason |
|---|---|---|
| Customer/site/asset context | CORE | Common context across operating models |
| Observations/evidence | CORE | Common input language |
| Situations | CORE | Converts signals into operational problems/conditions |
| Recommendations | CORE | Converts context into explainable next steps |
| Work | CORE | Turns intelligence into execution |
| Verification | CORE | Establishes whether outcomes actually occurred |
| Actions/authorization | CORE | Controls consequential operations |
| Communication | CORE | Evidence and workflow channel |
| Audit | CORE | Trust/provenance |
| Installation/project delivery | OPTIONAL CAPABILITY | Strong EPC fit |
| Warranty/service | OPTIONAL CAPABILITY | Strong service/O&M fit |
| Maintenance/field service | OPTIONAL CAPABILITY | Common but should be driven by actual workflow evidence |
| Payment evidence/reconciliation | OPTIONAL CAPABILITY | Strong PAYGo fit; payment evidence is not full accounting |
| Collections | OPTIONAL CAPABILITY | PAYGo-specific |
| Monitoring/telemetry | OPTIONAL CAPABILITY | Useful where organizations actually operate monitoring |
| Meter readings/OCR | DEFERRED CAPABILITY | Can be an evidence source; not required for first EPC/PAYGo slice |
| Lenco/provider adapters | DEFERRED CAPABILITY | Reuse when an ICP workflow proves a payment/provider need |
| Full accounting/ledger | DEFERRED | Not required for first operational slice |
| Settlement/treasury | DEFERRED | Requires independent financial workflow validation |
| PCU/wallets | ISOLATE | Historical product/economic thesis, explicitly outside first operational slice |
| P2P marketplace/matching | ISOLATE | Historical economic product; no first-slice ICP requirement |
| Staking/blockchain | ISOLATE | Historical protocol layer |
| Cluster governance/ownership economics | ISOLATE | Historical operating model, not the tenant boundary |
| Universal ERP/no-code workflows | EXCLUDE | Would dilute the operational intelligence wedge |

## Reading capability correction

The exploratory canonical meter-reading migration was applied and immediately retired through migration 035. No meter-reading tables remain in the active canonical database.

The old reading/OCR/validation implementation remains valuable reference IP and should be reconsidered only when an active ICP workflow establishes the need for it.

This is intentional scope control, not loss of the codebase.

## Current build priority

1. Finish the shared operational kernel.
2. Prove EPC and PAYGo can traverse the same kernel.
3. Measure operational outcomes.
4. Introduce the smallest capability required by the first real organization.
5. Repeat across different operating models without changing the kernel.
6. Only then graduate legacy capabilities that repeatedly solve real customer problems.

The architecture is therefore broad by **configuration and extension points**, not broad by the number of modules shipped on day one.
