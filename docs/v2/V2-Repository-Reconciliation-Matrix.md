# V2 Repository Reconciliation Matrix

Status: PHASE 1 RECONCILIATION GATE  
Date: 2026-09-23  
Branch: `reconstruction/platform-identity-boundary`

## 1. Purpose

This document replaces the earlier static V1→V2 dependency map as the working repository-reconciliation artifact.

The objective is not to create a permanent V2 application beside the existing Enerlectra application. The objective is to progressively make this repository itself conform to the V2 Enerlectra architecture.

Disposition rules:

- **KEEP** — aligned platform/domain capability with no material reconstruction required.
- **ADAPT** — useful capability whose current implementation has legacy identity, tenancy, domain, or security assumptions.
- **DELETE** — legacy product capability with no current V2 domain responsibility.
- **QUARANTINE** — potentially reusable but not justified by the current V2 operational kernel; V2 must not depend on it.
- **BLOCKER** — an active dependency that prevents safe deletion or cutover.

No component is classified as DELETE solely from its filename. Active imports, runtime entrypoints, database dependencies, and cross-component reachability are considered.

---

## 2. Target dependency direction

The active repository should converge toward:

```text
CHANNELS
  ↓
PLATFORM IDENTITY / TENANCY
  ↓
V2 OPERATIONAL DOMAIN
  ↓
INTELLIGENCE / RECOMMENDATIONS
  ↓
AUTHORIZED COMMANDS
  ↓
ACTIONS / WORK
  ↓
VERIFICATION / EVIDENCE
  ↓
AUDIT / INSIGHTS
```

Legacy market/economic mechanisms must not sit underneath this path.

The canonical V2 operational loop is:

```text
OBSERVE
  ↓
EVENT
  ↓
DETECT / UNDERSTAND
  ↓
SITUATION
  ↓
PRIORITIZE
  ↓
WORK
  ↓
ACTION
  ↓
EVIDENCE
  ↓
VERIFY
  ↓
RESOLVED / ESCALATED / REOPENED
  ↓
LEARN
```

---

## 3. Active server entrypoint — highest priority reconciliation

### `server/src/index.ts`

Current state: **BLOCKER**

The entrypoint still identifies itself as a “Full Marketplace + Settlement Engine” and directly imports legacy runtime components.

### Direct legacy imports

| Component | Current role | V2 relationship | Disposition |
|---|---|---|---|
| `routes/staking.ts` | PCU staking API | No V2 primitive | DELETE |
| `routes/ledger.ts` | Legacy economic ledger | Not the V2 authoritative-state model | DELETE / QUARANTINE |
| `routes/marketplace.ts` | Energy trading marketplace | No current V2 requirement | DELETE |
| `routes/settlement.ts` | Legacy settlement/payout API | Future bounded financial capability only | QUARANTINE |
| `jobs/settlementCron.ts` | Background settlement | Old product runtime | DELETE |
| `jobs/matchingCron.ts` | Marketplace matching | Old product runtime | DELETE |
| `jobs/payoutProcessorCron.ts` | Legacy payout processing | Future bounded financial capability only | QUARANTINE |
| `services/settlement.ts` | Settlement implementation | Old financial domain | QUARANTINE |
| `services/staking.ts` | PCU staking | No V2 primitive | DELETE |
| `services/pcuMinting.ts` | PCU creation | No V2 primitive | DELETE |
| `services/clusterSettlementEngine.ts` | Cluster settlement | No V2 primitive | DELETE |
| `services/tariffSync.ts` | Tariff integration | Potential future bounded capability | QUARANTINE |
| `routes/readings.ts` | Legacy meter-reading workflow | Potential evidence/observation source | ADAPT |
| `routes/simulation.ts` | Legacy simulation | Not part of current operational kernel | QUARANTINE |
| `routes/protocol.ts` | Legacy protocol/dashboard surface | Must be replaced by V2 operational surfaces | DELETE / ADAPT |
| `routes/payments.ts` | Legacy payment flow | Payment may become bounded capability | QUARANTINE / ADAPT |
| `routes/webhooks.ts` | Provider webhooks | Adapter infrastructure may be reusable | ADAPT |

### Current direct V2 imports

| Component | V2 relationship | Disposition |
|---|---|---|
| `routes/customerOperationalIssues.ts` | Customer issue operational slice | KEEP |
| `routes/actions.ts` | Authorized action boundary | KEEP |
| `platform/tenant/*` | Actor/membership/org authorization | KEEP |
| V2 Supabase client created in entrypoint | Target database boundary | ADAPT → KEEP once centralized |

### Critical finding

The entrypoint still creates its primary Supabase client from:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

while V2 uses:

```text
V2_SUPABASE_URL
V2_SUPABASE_SERVICE_ROLE_KEY
```

Therefore the active runtime is still fundamentally the legacy application with V2 routes attached to it.

This is the central repository-reconciliation blocker.

---

## 4. Server route inventory

| Path | Current domain | Runtime | V2 disposition |
|---|---|---:|---|
| `routes/actions.ts` | Action execution | Active V2 | KEEP |
| `routes/customerOperationalIssues.ts` | Operational issue workflow | Active V2 | KEEP |
| `routes/clusters.ts` | Legacy cluster economy | Legacy | DELETE |
| `routes/contributions.ts` | Cluster funding/economic shares | Legacy | DELETE |
| `routes/distribution.ts` | Legacy distribution/energy economy | Legacy/unclear | QUARANTINE |
| `routes/distributionFinalize.ts` | Legacy distribution finalization | Legacy/unclear | QUARANTINE |
| `routes/ledger.ts` | Legacy economic ledger | Legacy | DELETE / QUARANTINE |
| `routes/lifecycle.ts` | Legacy cluster/project lifecycle | Legacy | DELETE / ADAPT only if a V2 lifecycle primitive is proven |
| `routes/marketplace.ts` | Marketplace | Legacy | DELETE |
| `routes/ownership.ts` | Economic ownership shares | Legacy | DELETE |
| `routes/ownershipLedger.ts` | Ownership/economic ledger | Legacy | DELETE |
| `routes/payments.ts` | Payment/redeem flow | Mixed | QUARANTINE / ADAPT |
| `routes/protocol.ts` | Old protocol surface | Legacy | DELETE |
| `routes/readings.ts` | Meter/readings | Potential observation source | ADAPT |
| `routes/settlement.ts` | Settlement | Legacy financial | QUARANTINE |
| `routes/simulation.ts` | Simulation | Non-kernel capability | QUARANTINE |
| `routes/staking.ts` | Staking | Legacy | DELETE |
| `routes/suppliers.ts` | Supplier workflow | Potential operational capability | QUARANTINE / ADAPT |
| `routes/system.ts` | Platform/system endpoints | Mixed | ADAPT |
| `routes/webhooks.ts` | External channel/provider adapters | Infrastructure | ADAPT |

---

## 5. Server service inventory

| Service | Dependency/domain | Disposition |
|---|---|---|
| `customerOperationalIssues.ts` | V2 observation → event → situation → work | KEEP |
| `actions.ts` | V2 action boundary | KEEP |
| `posthog.ts` | Telemetry infrastructure | KEEP |
| `validation.ts` | Generic validation; inspect callers | ADAPT / KEEP |
| `lencoService.ts` | Provider integration | QUARANTINE until a bounded financial workflow is validated |
| `payment-orchestrator.ts` | Legacy payment orchestration | QUARANTINE |
| `batchPayoutProcessor.ts` | Legacy payout processing | QUARANTINE |
| `settlement.ts` | Legacy settlement | QUARANTINE |
| `settlementStateSupabase.ts` | Legacy settlement persistence | QUARANTINE |
| `settlementSupabase.ts` | Legacy settlement persistence | QUARANTINE |
| `clusterSettlementEngine.ts` | Cluster economy | DELETE |
| `matchingEngine.ts` | Marketplace matching | DELETE |
| `pcuMinting.ts` | PCU economy | DELETE |
| `staking.ts` | Staking economy | DELETE |
| `contributionsSupabase.ts` | Cluster funding | DELETE |
| `distributionSupabase.ts` | Legacy distribution | QUARANTINE / DELETE after reachability check |
| `tariffSync.ts` | External tariff data | QUARANTINE |

---

## 6. Background jobs

The following are currently imported directly by `server/src/index.ts`, making them active runtime dependencies rather than dead files:

| Job | Disposition | Reason |
|---|---|---|
| `settlementCron.ts` | DELETE | Old settlement product loop |
| `matchingCron.ts` | DELETE | Old marketplace matching loop |
| `payoutProcessorCron.ts` | QUARANTINE | Financial capability not part of current V2 kernel |

The safe order is:

1. replace the active runtime path;
2. remove entrypoint imports;
3. verify no other runtime imports;
4. only then delete the files.

---

## 7. Enerlectra Core — major reconciliation finding

The core package is **not currently a clean V2 kernel**.

### Core areas

| Area | Current state | Disposition |
|---|---|---|
| `core/eventing` | Potential reusable infrastructure | ADAPT |
| `core/contracts` | Potential reusable contracts | ADAPT |
| `core/workflow` | Workflow engine still dispatches legacy commands | ADAPT / REBUILD |
| `core/bus` | Command bus infrastructure | ADAPT |
| `core/routing` | Channel message routing | ADAPT |
| `bootstrap/create-kernel.ts` | Registers legacy PCU/token/support/meter commands | REBUILD |
| `domain/intelligence` | Ellie concept is reusable, data context is legacy | ADAPT |
| `domain/ledger` | Legacy economic ledger | DELETE / QUARANTINE |
| `domain/marketplace` | Legacy trading | DELETE |
| `domain/payment` | Legacy payment flows | QUARANTINE |
| `domain/settlement` | Legacy settlement | QUARANTINE |
| `domain/treasury` | Legacy treasury | QUARANTINE |
| `domain/production` | Legacy production/energy-market assumptions | QUARANTINE |
| `matching` | Legacy marketplace matching | DELETE |
| `engines` | Mixed; trace individually | QUARANTINE |
| `persistence` | Mixed; trace individually | ADAPT / QUARANTINE |
| `adapters/whatsapp` | Reusable channel boundary | ADAPT |
| `adapters/telegram` | Not required for current V2 | QUARANTINE |

### Confirmed legacy kernel registrations

`create-kernel.ts` currently registers:

- `SHOW_BALANCE`
- `START_REDEMPTION_FLOW`
- `SHOW_HISTORY`
- `START_SUPPORT_SESSION`
- `GENERATE_TOKEN`
- `PROCESS_METER_READING_IMAGE`
- `GENERIC_QUERY`

Several of these still depend on the old product.

Examples:

- `ShowBalanceHandler` queries `pcu_balances` and imports PCU wallet backfill.
- `StartRedemptionHandler` queries `telegram_users`, `cluster_members`, and `clusters`, and creates PCU redemption state.
- `GenerateTokenHandler` queries legacy `transactions`.
- `ProcessMeterReadingImageHandler` resolves a cluster and mints PCU.

These are not V2 domain handlers.

### Required kernel direction

The kernel must eventually register V2 capabilities such as:

```text
REPORT_OPERATIONAL_ISSUE
GET_OPERATIONAL_CONTEXT
CREATE_WORK
ASSIGN_WORK
EXECUTE_ACTION
VERIFY_WORK
REQUEST_RECOMMENDATION
```

The exact command vocabulary should follow the V2 domain model and actual workflows, not be invented as a generic command catalogue.

---

## 8. WhatsApp path — critical blocker

Current flow is effectively:

```text
AuthKey webhook
  ↓
WhatsAppWebhookHandler
  ↓
resolveWhatsAppUserId()
  ↓
organizationId = ''
  ↓
legacy WorkflowEngine
  ↓
legacy CommandBus / Ellie
```

Separately, `server/src/index.ts` subscribes to `message.received` and constructs:

```text
organizationId: 'default-org'
```

This violates the frozen V2 identity boundary.

### Required V2 flow

```text
WhatsApp channel identity
  ↓
Actor
  ↓
active Membership
  ↓
Organization
  ↓
authorized V2 operational workflow
```

No channel identifier, phone number, header, or invented organization value may establish authorization.

### Disposition

- WhatsApp adapter: **ADAPT**
- Legacy WorkflowEngine path: **REBUILD**
- `default-org`: **DELETE**
- Legacy message subscriber: **REBUILD / RETIRE**
- Channel identity resolution: **ADAPT into V2 tenant resolver**

This must be resolved before WhatsApp becomes the V2 production channel.

---

## 9. Ellie

Ellie remains useful as the intelligence layer, but the current context builder is legacy-shaped.

Current context builder queries:

- `customers`
- `transactions`
- `alerts`

and is not tenant-scoped through the V2 TenantContext.

The current Ellie path therefore cannot yet be considered a V2 intelligence boundary.

### V2 Ellie contract

Ellie should receive bounded, authorized context containing:

- actor;
- active organization;
- role/permissions;
- operating model;
- enabled capabilities;
- organization policies;
- relevant customer/site/asset context;
- operational evidence;
- open situations/work;
- allowed action/recommendation capabilities.

Ellie must not independently establish tenant authority, authorize actions, or access unrestricted legacy tables.

Disposition: **ADAPT / REBUILD CONTEXT BUILDER**.

---

## 10. Supabase boundaries

### Legacy boundary

Current runtime still uses:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

through:

- `server/src/index.ts`
- `enerlectra-core/src/lib/supabase.ts`
- `enerlectra-core/src/infrastructure/supabase.ts`

### V2 boundary

V2 uses:

```text
V2_SUPABASE_URL
V2_SUPABASE_ANON_KEY
V2_SUPABASE_SERVICE_ROLE_KEY
```

where authenticated integration requires the anon key and server-side privileged operations use the service role.

### Required end state

There must be one explicit active V2 server database boundary.

Legacy Supabase clients must not remain silently reachable from V2 domain code.

Disposition:

- V2 client: **KEEP**
- legacy client: **QUARANTINE → DELETE after runtime cutover**
- V2 browser client: **ADAPT**
- core global service-role client: **DELETE from V2 path**

---

## 11. Environment/configuration reconciliation

Current `.env.example` still contains large groups of legacy configuration:

- PCU/staking configuration;
- DynamoDB;
- MTN/Airtel legacy payment configuration;
- legacy Supabase;
- Lenco settlement;
- legacy energy-market rates.

Some integrations may remain useful, but configuration presence is not evidence that a capability belongs in V2.

### Required classification

| Configuration | Disposition |
|---|---|
| Node/Express/port/logging | KEEP |
| V2 Supabase variables | KEEP |
| PostHog | KEEP |
| Anthropic | KEEP / ADAPT |
| AuthKey WhatsApp | KEEP / ADAPT |
| Lenco | QUARANTINE |
| MTN/Airtel legacy payment groups | QUARANTINE |
| PCU/staking settings | DELETE |
| DynamoDB settings | QUARANTINE / DELETE after consumer audit |
| legacy tariff settings | QUARANTINE |
| legacy `SUPABASE_*` | QUARANTINE during migration, DELETE after cutover |

---

## 12. Deployment reconciliation

### Render

`render.yaml` still deploys:

- `enerlectra-ellie-bot` from `integrations/telegram-bot`;
- `enerlectra-backend` from the repository root.

The backend start command is the root `npm start`, which points to:

```text
server/src/index.ts
```

Therefore the current Render backend is the legacy-contaminated entrypoint.

The V2 repository work is not production-connected merely because V2 migrations exist.

Disposition: **ADAPT**.

### Docker

The Dockerfile is also stale relative to the current Node 24 package engine and current root application layout.

It uses Node 18 and a legacy `dist/index.js` start path.

Disposition: **ADAPT / REBUILD**.

---

## 13. Client reconciliation

### Active router currently exposes

- Dashboard
- Cluster creation/detail
- Energy Wallet
- Transactions
- Trading
- Admin/Pilot

The router therefore still presents the old product model.

### Strong legacy client surfaces

| Surface | Disposition |
|---|---|
| ClusterDetailPage | DELETE |
| LaunchClusterPage | DELETE |
| EnergyWalletPage | DELETE |
| TradingPage | DELETE |
| TransactionsPage | DELETE / ADAPT only if it becomes a bounded operational evidence view |
| cluster feature area | DELETE |
| contribution feature area | DELETE |
| trading feature area | DELETE |
| protocol feature area | DELETE |
| campaign/simulation | QUARANTINE |
| auth components | KEEP / ADAPT |
| layout/design system | KEEP / ADAPT |
| admin components | ADAPT |
| grid/energy components | QUARANTINE until mapped to V2 workflows |

### Client target

The V2 client should expose operational concepts rather than the old energy-market concepts:

- organization context;
- operational dashboard;
- customers;
- sites;
- assets;
- situations;
- work;
- actions/recommendations;
- verification;
- communications;
- Ellie.

---

## 14. Client hooks

Confirmed legacy hooks:

- `useCluster`
- `useMarketState`
- `usePCUTrend`
- `useTransactions`
- `useUserAssets`

Disposition:

- cluster/market/PCU hooks: **DELETE**
- transaction hook: **DELETE / ADAPT after domain decision**
- user-assets hook: **ADAPT** to V2 asset/site context only if it does not retain legacy ownership semantics
- auth hook: **ADAPT / KEEP**

---

## 15. Database dependency reconciliation

### V2 authoritative operational objects

The V2 database now contains the reconstructed operational kernel:

- actors
- organizations
- memberships
- roles
- permissions
- customers
- sites
- assets
- observations
- events
- situations
- work_items
- actions
- action_attempts
- verifications
- communication/audit structures where applicable.

### Legacy database objects found in active code

Examples include:

- clusters;
- cluster_members;
- contributions;
- ownership snapshots;
- energy_wallets;
- pcu_balances;
- pcu_logs;
- pcu_mints;
- pcu_transfers;
- transactions;
- settlement tables;
- treasury tables;
- marketplace tables;
- matching/trade tables;
- staking tables;
- alerts;
- legacy webhook/payment tables.

These must not be dropped merely because they are legacy. First remove runtime consumers, verify no external production path depends on them, archive if necessary, and only then remove database objects.

---

## 16. Active dependency graph

The current active graph is approximately:

```text
server/src/index.ts
│
├── legacy Supabase client
│
├── legacy routes
│   ├── clusters
│   ├── payments
│   ├── readings
│   ├── simulation
│   ├── protocol
│   ├── staking
│   ├── ledger
│   ├── marketplace
│   └── settlement
│
├── legacy jobs
│   ├── settlementCron
│   ├── matchingCron
│   └── payoutProcessorCron
│
├── legacy services
│   ├── settlement
│   ├── staking
│   ├── pcuMinting
│   └── clusterSettlementEngine
│
├── legacy-shaped core kernel
│   ├── PCU balance
│   ├── redemption
│   ├── token
│   ├── meter reading
│   └── legacy Ellie context
│
└── V2 additions
    ├── customerOperationalIssues
    ├── actions
    ├── tenant resolver
    └── V2 Supabase
```

This graph confirms the repository is not yet V2-primary.

---

## 17. Reconciliation sequence

The safe sequence is now:

### Gate A — Freeze the V2 domain boundary
Already substantially complete.

### Gate B — Complete repository reconciliation
This document establishes the first full pass.

Remaining work:
- trace indirect imports of QUARANTINE candidates;
- trace all environment-variable consumers;
- trace all legacy table consumers;
- trace webhook entrypoints;
- trace scheduled/background execution;
- trace client navigation reachability;
- trace external deployment references.

### Gate C — Replace active runtime kernel
Before deleting legacy files:

1. establish the V2 server composition root;
2. centralize V2 Supabase access;
3. make TenantContext mandatory;
4. replace the legacy WhatsApp workflow path;
5. replace legacy Ellie context construction;
6. mount only V2 operational routes;
7. remove legacy cron imports.

### Gate D — Delete unreachable legacy runtime
Delete the old product in dependency-safe groups:

1. staking;
2. PCU;
3. marketplace/matching;
4. clusters/contributions/ownership;
5. settlement runtime;
6. legacy client surfaces;
7. legacy core command handlers;
8. remaining legacy persistence.

### Gate E — Database retirement
Only after runtime reachability is zero:

1. archive required historical data;
2. verify no production consumer remains;
3. remove legacy DB objects;
4. remove legacy environment variables.

### Gate F — Complete V2 operational loop
Only on the cleaned runtime:

```text
customer/system signal
→ observation
→ event
→ situation
→ prioritization
→ work
→ action
→ evidence
→ verification
→ resolution/escalation/reopen
→ learning
```

### Gate G — Validation and deployment
Then:

- authenticated integration tests;
- tenant-isolation tests;
- local runtime;
- Render staging/cutover;
- frontend deployment;
- production observability;
- merge to main.

---

## 18. Current blockers

1. **Legacy server composition root** — active V1 and V2 simultaneously.
2. **Legacy Supabase client is still primary runtime DB**.
3. **Legacy core kernel is still the WhatsApp workflow kernel**.
4. **`default-org` remains in the active message-processing path**.
5. **Legacy background jobs are imported at server startup**.
6. **Legacy routes are exposed by the active server**.
7. **Legacy client navigation is still the primary UI**.
8. **Ellie context is not yet V2 tenant-scoped**.
9. **Deployment configuration still assumes the old application shape**.
10. **Legacy database consumers have not yet been reduced to zero**.

CI is therefore not the next architectural gate. Repository reconciliation is.

---

## 19. First deletion boundary

The first deletion boundary should **not** be individual files chosen from a list.

It should be the active runtime dependency boundary:

```text
server/src/index.ts
        ↓
V2 composition root
        ↓
V2 tenant context
        ↓
V2 operational routes
        ↓
V2 operational kernel
```

Once that boundary no longer imports the old market/economic domain, the old domain becomes removable by reachability rather than by guesswork.

That is the point at which “delete, delete, delete” becomes safe.

---

## 20. Phase 1 conclusion

The repository X-ray has now progressed from a static architecture map to an executable reconciliation model.

The important result is not that many legacy files exist. The important result is that the **active runtime still depends on them**.

Therefore:

```text
DO NOT MERGE
DO NOT CUT OVER
DO NOT ADD MORE LEGACY-SHAPED V2 FEATURES
DO NOT FIGHT CI AS THE PRIMARY TASK

FIRST:
REPLACE THE ACTIVE COMPOSITION ROOT
→ REMOVE LEGACY RUNTIME DEPENDENCIES
→ REBUILD THE CHANNEL/ELLIE PATH ON V2 TENANCY
→ THEN DELETE UNREACHABLE LEGACY DOMAIN
→ THEN COMPLETE THE V2 OPERATIONAL LOOP
```

This is the repository-reconciliation gate for the reconstruction branch.
