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

The convergence order is now governed by **adaptability over vertical duplication**.

### Layer 1 — Canonical platform foundation

Keep one shared platform for:

- identity
- actor
- membership
- organization
- tenant isolation
- permissions
- operating context
- capabilities
- policies
- communication adapters
- audit/evidence
- observability

This layer must remain independent of any particular energy business model.

### Layer 2 — Shared operational kernel

The kernel is:

\`\`\`
Customer / Site / Asset context
          ↓
Observation / Evidence
          ↓
Event
          ↓
Situation
          ↓
Recommendation
          ↓
Authorized Work
          ↓
Action / Attempt
          ↓
Verification
          ↓
Audit
\`\`\`

This is the reusable operational language across energy-facing businesses.

### Layer 3 — Configurable organization behaviour

Organization-specific behaviour belongs in:

- operating profiles;
- business-model descriptors;
- enabled capabilities;
- capability configuration;
- policies;
- responsibility scope;
- bounded workflow configuration;
- terminology and escalation rules.

Do not create separate EPC, PAYGo, mini-grid, maintenance, distributor, or energy-trader products.

Mixed operating models are expected.

### Layer 4 — Optional capabilities

Capabilities such as:

- monitoring;
- meter readings;
- OCR;
- installation;
- commissioning;
- warranty;
- maintenance;
- field service;
- payment reconciliation;
- collections;
- remote service;
- contract management;
- portfolio reporting

should be added when a real organization workflow requires them.

Their presence must not alter the canonical tenant or operational primitives.

### Layer 5 — Historical/experimental systems

Keep legacy economic and protocol capabilities isolated:

- PCU;
- wallets;
- P2P trading;
- marketplace;
- staking;
- cluster economics;
- blockchain settlement;
- universal financial ledger.

Preserve valuable algorithms and provider integrations where useful, but do not let historical architecture determine the new platform boundary.

---

# 21. Adaptability-first ICP test

The product must be evaluated using this sequence:

\`\`\`
Real organization problem
        ↓
Operational job
        ↓
Evidence required
        ↓
Interpretation / Situation
        ↓
Decision or recommendation
        ↓
Work
        ↓
Outcome verification
        ↓
Measurable operational improvement
\`\`\`

A capability earns active-product status only when it:

1. solves a real workflow for an energy-facing organization;
2. creates measurable operational value;
3. respects organization and resource boundaries;
4. can operate alongside different operating models;
5. does not require duplicating the canonical domain;
6. has enough evidence to justify its implementation cost.

EPC and PAYGo are **validation cases**, not product boundaries.

The architecture must also support organizations that combine multiple activities or commercial models.

---

# 22. Current canonical implementation

The branch now contains a materially broader operational foundation than the earlier X-ray checkpoint.

### Tenant operating context

The tenant resolver now loads, within the authenticated organization boundary:

- operating profile;
- business-model descriptors;
- enabled capabilities;
- capability configuration;
- active policies.

Business-model descriptors are informational context. They do not grant authority.

### Customer / Site / Asset context

The canonical workspace and APIs now expose organization-scoped customer, site and asset context without introducing a new vertical-specific hierarchy.

### Operational intelligence

Operational issue intake now traverses:

\`\`\`
Observation
   ↓
Event
   ↓
Situation
   ↓
Recommendation
   ↓
Work
\`\`\`

Recommendations receive the organization's operating context so the same operational pattern can produce different next-step guidance without branching into separate products.

### Verification

Verification is a canonical outcome boundary. It establishes whether the intended work/action produced the expected operational result and can resolve the associated situation.

### Audit

Tenant-scoped audit records provide a separate governance trail from operational evidence.

Evidence answers:

> What happened in the operational world?

Audit answers:

> What did Enerlectra or an authorized actor do about it?

These remain separate concepts.

### Extensible work types

Work types are intentionally stored as organization-specific text rather than a fixed EPC/PAYGo enumeration.

Lifecycle semantics remain platform-defined; the operational category can vary by organization.

This is an important adaptability invariant.

---

# 23. Recommendation architecture

Recommendations are derived data.

They may use:

- organization operating profile;
- business-model descriptors;
- enabled capabilities;
- capability configuration;
- policies;
- customer/site/asset context;
- evidence;
- requested work category.

They must not directly mutate authoritative state.

The current rule-based recommendation implementation is deliberately bounded. It demonstrates the intelligence boundary without prematurely implementing an opaque AI engine.

The next evolution should make recommendation selection increasingly configuration/context-aware while preserving:

\`\`\`
Evidence
 + organization context
 + policy/capability context
        ↓
Explainable recommendation
        ↓
Authorized operation
\`\`\`

Business-model-specific logic must not become a giant switch statement.

---

# 24. Capability disposition

| Capability | Current posture | Rationale |
|---|---|---|
| Identity / tenancy | CORE | Platform invariant |
| Operating context | CORE | Enables organizational variation |
| Customer / Site / Asset | CORE | Shared operational context |
| Evidence / Events | CORE | Common evidence language |
| Situations | CORE | Shared operational interpretation |
| Recommendations | CORE | Shared intelligence boundary |
| Work | CORE | Shared execution abstraction |
| Actions / Authorization | CORE | Consequential operation control |
| Verification | CORE | Outcome accountability |
| Audit | CORE | Governance/provenance |
| Communication | CORE | Operational interaction boundary |
| Installation / commissioning | OPTIONAL | Organization capability |
| Warranty / maintenance | OPTIONAL | Organization capability |
| Field service | OPTIONAL | Organization capability |
| Monitoring / telemetry | OPTIONAL | Evidence source where required |
| Meter readings / OCR | OPTIONAL | Evidence capability, not universal product definition |
| Payment evidence / reconciliation | OPTIONAL | Needed where operating model requires it |
| Collections | OPTIONAL | Capability for relevant organizations |
| Lenco / provider adapters | OPTIONAL | Integration capability, not universal financial model |
| Full ledger / accounting | DEFERRED | Requires validated financial workflow |
| Settlement / treasury | DEFERRED | Requires validated financial workflow |
| PCU / wallets | ISOLATED | Historical economic subsystem |
| Marketplace / P2P | ISOLATED | Historical economic subsystem |
| Staking / blockchain | ISOLATED | Historical protocol subsystem |
| Cluster economics | ISOLATED | Historical architecture, not tenant boundary |
| Generic no-code workflow engine | EXCLUDED | Conflicts with bounded configuration principle |

---

# 25. Legacy code relationship

The repository contains substantial reusable IP.

The correct question is no longer:

> “Is this old code or new code?”

It is:

> “Does this capability solve a current operational problem, and can its valuable logic operate inside the canonical boundary?”

Therefore:

- valuable algorithms are preserved;
- provider integrations are preserved;
- proven validation logic is preserved;
- historical schemas are not automatically promoted;
- cluster/user authorization assumptions are not preserved;
- duplicated runtime implementations are not allowed;
- experimental capabilities remain isolated until justified.

The final system must converge toward **one Enerlectra runtime**, not a V1/V2 split.

---

# 26. Current implementation checkpoint

At the current branch head:

\`5fb964161c40f233e8d689547bbb779580ce2029\`

the adaptability work includes:

- customer/site/asset operational context;
- organization operating profiles;
- business-model descriptors;
- organization capabilities and policies;
- context-aware recommendations;
- verification boundary;
- tenant-scoped operational audit;
- organization-specific extensible work types;
- HTTP-level operational-intelligence tests;
- cross-tenant rejection coverage.

The exploratory meter-reading migration remains present in repository history but is explicitly deferred from the active canonical product path by migration 035. No active meter-reading table is present in the live canonical database.

The latest Vercel deployment for the branch head reports **successful deployment**. CodeRabbit reports success only in the sense that the PR is draft and review was skipped; it is not evidence of a completed code review.

The next implementation decision must therefore come from the next highest-value cross-model workflow supported by customer evidence, not from the existence of another legacy subsystem.

## Architectural invariant

**Enerlectra is broad because its operational kernel and capability boundary are adaptable — not because every energy-business capability is implemented at once.**

That distinction is now the governing rule for the X-ray.
