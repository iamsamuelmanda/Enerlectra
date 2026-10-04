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

## 3. Active server entrypoint — live branch correction

### `server/src/index.ts`

Current state: **ADAPTED V2 COMPOSITION ROOT — PRODUCT CUTOVER INCOMPLETE**

Live inspection of `reconstruction/platform-identity-boundary` at the 2026-10-04 audit found that the earlier description in this matrix is stale. The active entrypoint now:

- Creates its database client only from `V2_SUPABASE_URL` and `V2_SUPABASE_SERVICE_ROLE_KEY`.
- Fails startup if either V2 credential is missing; it does not fall back to legacy `SUPABASE_URL` or `SUPABASE_SERVICE_KEY`.
- Mounts the V2 Customer Operational Issue and Action routers.
- Does not import or mount the legacy cluster, staking, ledger, marketplace, settlement routes, or settlement/matching/payout cron jobs.
- Checks actual V2 database connectivity through `public.organizations` in `/api/health`.
- Keeps the WhatsApp webhook fail-closed with HTTP 503 pending a safe V2 channel adapter.

The previous claims that this entrypoint directly imports the legacy runtime and uses the legacy Supabase credentials are superseded for this branch.

### Core and channel boundary

- `enerlectra-core/src/bootstrap/create-kernel.ts` no longer registers PCU, cluster, token, or redemption handlers. Its command registry remains empty pending bounded V2 channel commands.
- `server/src/index.ts` does not mount the old WhatsApp handler.
- The old `enerlectra-core/src/adapters/whatsapp/webhook-handler.ts` still contains legacy writes to `communication_messages`, phone-number identity resolution, and a path that continues after identity-resolution failure with empty actor/organization context. It must remain quarantined.
- `command-factory.ts` rejects missing actor and organization values and no longer supplies `default-org`; however, the message contract itself does not prove those values were established by a trusted identity adapter.
- The legacy bot-state helper still queries `telegram_users` and is not a V2 identity primitive.

### Client boundary

The active client router exposes only `V2Home`; legacy protocol and legacy authentication pages are no longer reachable. This is currently an informational landing page, not an authenticated operational workspace. V2 browser sign-in, actor provisioning, organization onboarding, multi-organization selection, and the operational customer/site/asset/situation/work UI remain incomplete.

### Current reconciliation blocker

The server composition root is no longer the legacy-runtime blocker. The remaining cutover blockers are authenticated browser onboarding/workspace, safe channel identity integration, legacy dependency reachability/quarantine, and repeatable passing CI/build evidence. Production Render must remain on its existing configuration until those gates pass.

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

The active `server/src/index.ts` inspected on 2026-10-04 does **not** import or schedule the legacy settlement, matching, or payout jobs. They are not active server-entrypoint dependencies.

| Job | Current runtime status | Disposition |
|---|---|---|
| `settlementCron.ts` | Not imported by active server entrypoint | QUARANTINE pending whole-repository import/reachability trace |
| `matchingCron.ts` | Not imported by active server entrypoint | QUARANTINE pending whole-repository import/reachability trace |
| `payoutProcessorCron.ts` | Not imported by active server entrypoint | QUARANTINE pending bounded financial capability decision |

Do not delete these files solely because they are absent from the server entrypoint. Trace all imports, scripts, integrations, and deployment entrypoints first.

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

### Current kernel registration state (verified 2026-10-04)

`create-kernel.ts` currently creates the ServiceRegistry, CommandBus, MessageRouter, and WorkflowEngine but registers **no command handlers**. Its comments explicitly state that legacy PCU, cluster, token, and redemption handlers are not registered. Channel senders are also not globally registered.

The old handler source files still exist. Examples inspected include:

- `balance.handler.ts`: legacy PCU balance reads.
- `history.handler.ts`: legacy meter-reading/export-earnings history.
- `redeem.handler.ts`: legacy Telegram, cluster, and PCU redemption dependencies.
- `token.handler.ts`: legacy Telegram/transaction dependencies.
- `process-meter-reading-image.handler.ts`: image/OCR intake coupled to legacy cluster/PCU behavior.

These files are **not evidence of active kernel registration**. They remain quarantine/reachability work until every import, integration entrypoint, script, and deployment reference is traced. The old WhatsApp handler is particularly unsafe: it writes the legacy `communication_messages` table and continues after failed identity resolution with empty actor/organization context. It is not mounted by the active server entrypoint; keep it quarantined.

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


---

## 21. Verified runtime reconciliation update — 2026-10-04

This section supersedes the earlier Phase 1 status and dependency graph above where they conflict. The earlier sections document the initial X-ray; this section records the branch state after the first runtime cleanup.

### Active server composition root

**Status: ADAPTED.**

The current `server/src/index.ts`:
- imports only the V2 Customer Operational Issue and Action routers as domain routes;
- requires `V2_SUPABASE_URL` and `V2_SUPABASE_SERVICE_ROLE_KEY` and throws on missing configuration;
- no longer imports the legacy cluster, staking, ledger, marketplace, settlement, PCU or matching jobs/services;
- mounts `POST /api/operational-issues` and the `/api/v2/actions` route group;
- returns HTTP 503 for inbound WhatsApp until V2 channel processing is connected;
- retains health, metrics, exchange-rate and stub MTN/Airtel endpoints.

The legacy server modules still exist in the repository. Their complete transitive reachability and external deployment use have not yet been audited.

### Core kernel and channel boundary

**Core kernel: ADAPTED / not active in the V2 server composition root.**
- Legacy PCU/cluster/token/redemption handlers are no longer registered.
- The command factory requires trusted actor and organization context and no longer supplies `default-org`.
- `server/src/platform/tenant/channel-resolver.ts` resolves channel identity → actor → active membership → organization → role permissions.
- That resolver is not yet wired to an operational WhatsApp conversation flow. The public webhook remains fail-closed with 503; do not describe WhatsApp as operational.

### Ellie

**Status: QUARANTINE.**
- The legacy Ellie context builder still queries V1 `transactions` and `alerts`.
- Ellie is not mounted in the active V2 server runtime.
- Do not reconnect the legacy worker until it is replaced with tenant-scoped V2 customer/site/asset/observation/event/situation/work context.

### Client

**Status: ACTIVE ROUTE GRAPH REDUCED TO V2 LANDING PAGE.**
- `client/src/routes/router.tsx` now exposes only `V2Home`.
- Legacy cluster, wallet, trading, transaction and legacy authentication routes are not active.
- `client/src/lib/supabase-v2.ts` exists and uses browser publishable credentials only, but is not yet connected to an authentication/onboarding UI.
- Sign-in, actor provisioning, organization creation/onboarding and authenticated operational screens remain unimplemented.
- The old client files and old Supabase client remain in the repository and require dependency tracing before deletion.

### Live target database verification

Target: `enerlectra-v2`, project ref `mtyhzvkiuibigjximsix`.

Direct queries on 2026-10-04 confirmed:
- migrations 001–021 are recorded;
- 20 public base tables exist and all 20 have RLS enabled;
- `public.create_customer_operational_issue(...)` exists;
- function EXECUTE is false for `anon` and `authenticated`, true for `service_role`;
- a live call created the observation/event/situation/work chain;
- replaying the same idempotency key returned the original IDs and left one work item;
- temporary verification organization and actor were deleted after the test.

This verifies the database schema and RPC. It does **not** prove that Render or another deployed server is already connected to this project. Production cutover remains explicitly deferred.

### Advisor findings

Security advisor:
- one warning for authenticated execution of SECURITY DEFINER `public.create_organization(text)`. This was intentional in the initial organization-creation flow, but must be reviewed before enabling browser onboarding.

Performance advisor:
- unindexed foreign keys;
- RLS initplan notices on actor policies;
- unused-index notices (expected on a low-traffic/new database, not a reason to drop indexes now);
- duplicate indexes on customer/site organization IDs.

These are recorded for a deliberate database hardening pass. Do not perform opportunistic destructive index cleanup during runtime reconciliation.

### Pull request and validation

- Existing review surface: [PR #35 — V2 reconstruction](https://github.com/iamsamuelmanda/Enerlectra/pull/35).
- PR remains **Draft** and is not approved for merge.
- Latest GitHub Actions runs reported `startup_failure` with zero jobs created; therefore no test job actually ran.
- Vercel status is failing, but Vercel is not the production cutover gate for this branch.
- CodeRabbit status is successful.
- A local clone/test run could not be started in this execution environment because outbound DNS/network access to GitHub is unavailable.

### Remaining merge gates

1. Wire V2 browser authentication and actor/organization onboarding; remove legacy browser Supabase dependency from any reachable route.
2. Decide whether WhatsApp is part of the initial merge scope. If yes, wire and integration-test the channel resolver and a V2 operational interaction; otherwise keep it explicitly disabled.
3. Replace or permanently quarantine legacy Ellie context and trace all legacy worker, cron, webhook, payment and database consumers.
4. Finish import/dependency reachability and environment-variable audits across server, core, client, integrations and deployment config.
5. Implement the minimum authenticated operational UI for customer/site/asset issues and work visibility.
6. Run runtime-boundary tests, authenticated integration tests, server/client typechecks and production client build successfully.
7. Review security advisor finding and test onboarding authorization.
8. Only then mark PR #35 ready for review and merge to `main`.

**Current conclusion:** the active backend and active client route graph have been substantially isolated from the old protocol product, and the new Supabase database has been queried and exercised directly. Reconstruction is not complete because authentication/onboarding, channel activation, Ellie adaptation/quarantine verification, full dependency audit, UI and automated validation remain open.

---

## 22. Reconciliation follow-up — live branch and database audit (2026-10-04)

This section is authoritative where it conflicts with earlier inventory or X-ray sections. The earlier sections preserve the original forensic findings; they must not be read as the current runtime state.

### Server and tenant boundary

- `server/src/index.ts` is the active V2 composition root. It requires `V2_SUPABASE_URL`, `V2_SUPABASE_ANON_KEY`, and `V2_SUPABASE_SERVICE_ROLE_KEY` at startup, mounts only the Customer Operational Issue and Action domain routers, checks the V2 `organizations` table for readiness, and returns 503 for WhatsApp.
- The legacy route/job/service files remain in the repository. They are not mounted by this entrypoint. Whole-repository import tracing and external deployment/script references are still required before deletion.
- Bearer-token tenant resolution verifies the Supabase user, resolves an active Actor, requires exactly one active Membership unless an organization is explicitly selected, checks the Organization state, and derives permissions from the Membership role.
- A separate `resolveChannelTenantContext` exists for WhatsApp/Telegram. It maps a channel identity to Actor → active Membership → Organization → role permissions. It is not wired to an active inbound webhook.
- The old WhatsApp handler was changed in commit `7bf4da728d66e46e32c92bc4d015bc0e8d5a0b62` into a fail-closed compatibility stub. It no longer writes `communication_messages`, resolves phone numbers into actors, or forwards messages to the legacy WorkflowEngine. A runtime-boundary regression test was added in commit `69a861979dce703f0efdeaa0c1c31616bebd26ca`.
- The public WhatsApp route remains 503. Channel identity writes are intentionally restricted until provider ownership verification is implemented. Do not enable WhatsApp merely because a resolver exists.

### Core and Ellie

- `create-kernel.ts` constructs the legacy command bus/workflow scaffolding with an empty handler registry. No V2 channel commands are registered.
- The legacy WorkflowEngine and command catalogue still encode PCU, redemption and token concepts. They are not part of the active V2 server composition root and remain quarantined; do not present them as the V2 operational kernel.
- Ellie and its context builder remain quarantined. The legacy context builder reads V1 transactions/alerts and must not be reconnected until replaced with tenant-scoped V2 context. No Ellie feature is currently active in the V2 runtime.

### Client

- `client/src/routes/router.tsx` exposes only `V2Home`. Legacy protocol/authentication routes are unreachable from the active router.
- `V2Home` is an informational landing page, not an authenticated workspace.
- `client/src/lib/supabase-v2.ts` uses only V2 browser publishable credentials. It is not yet connected to a sign-in/onboarding flow.
- Browser sign-in, trusted Actor provisioning, Organization onboarding/selection, and customer/site/asset/situation/work screens remain unimplemented. No self-service Actor lifecycle or channel identity provisioning should be added without a trusted invitation/admin boundary.

### Live Supabase verification

Target project: `enerlectra-v2` (`mtyhzvkiuibigjximsix`), region `eu-west-2`, status `ACTIVE_HEALTHY`.

Live project inspection on 2026-10-04 confirmed:
- Migration history contains `001_foundation` through `023_trusted_actor_provisioning_only`.
- 20 public base tables exist; all 20 have RLS enabled.
- 13 operational/domain tables have FORCE ROW LEVEL SECURITY. The remaining identity, organization and reference tables have RLS enabled but not FORCE; their policies/grants require continued review.
- `public.create_customer_operational_issue` exists and is SECURITY DEFINER.
- Authenticated role cannot INSERT into `actors` or update the `actors` table generally; it can update only explicitly granted profile fields (`display_name`, `email`, `phone`), not lifecycle columns such as `status`.
- Authenticated role has no INSERT, UPDATE or DELETE privilege on `channel_identities`.
- Migration 023 also drops the obsolete `actors_insert_self` policy and all three channel-identity self-write policies. Live checks confirm zero actor INSERT policies and zero channel identity write policies.
- The policy catalog was verified after migration 023; its exact current count is captured in the database review rather than treated as a security metric.

Migrations 022 and 023 are present in live migration history. Migration 022's SQL:
- revokes table-level UPDATE on `actors` from `authenticated`;
- grants UPDATE only on `display_name`, `email`, and `phone`;
- revokes INSERT/UPDATE/DELETE on `channel_identities` from `authenticated`;
- grants SELECT on `channel_identities`.

Earlier database-level rollback and idempotency checks for the operational-issue RPC remain valid. The current SQL checks do not constitute authenticated HTTP end-to-end tests. Do not claim the Action or issue HTTP suites have passed until they are actually run against this project.

### PR and validation

- Review surface: [PR #35 — V2 reconstruction](https://github.com/iamsamuelmanda/Enerlectra/pull/35). It remains a draft and is not approved for merge.
- GitHub Actions startup failure is attributable to the repository/account billing restriction and zero jobs were created. No CI pass is claimed. This is not a reason to keep retrying Actions while billing remains disabled.
- The repository's package scripts define local test, typecheck and client-build gates. Those commands still need to be run in an environment with the project dependencies installed and V2 test credentials available for authenticated integration tests.
- No production Render cutover has been performed. The legacy production project/configuration remains untouched.

### Remaining engineering gates

1. Complete the trusted browser onboarding contract: invitation/admin provisioning of Actor, Organization membership and role; then sign-in, membership selection and a minimum authenticated issue/work workspace.
2. Add and run integration tests for channel identity resolution, including unlinked/disabled identity, inactive Actor, no membership, ambiguous memberships, inactive Organization and permission derivation. Keep WhatsApp 503 until this path is wired and provider webhook authenticity is verified.
3. Replace Ellie’s V1 context builder with a V2 TenantContext-scoped read model, or formally remove/quarantine all entrypoints and dependencies. It must not query legacy transactions/alerts from a V2 request.
4. Finish import/reachability analysis across core, server routes/services/jobs, Telegram integration, client hooks/components, database clients, environment variables, Docker/Render/Vercel and other deployment definitions. Delete legacy files only after the complete consumer graph is known.
5. Run local unit/runtime tests, server/client typechecks and client production build. Run authenticated Action and issue HTTP suites against `enerlectra-v2` when secrets are available.
6. Review remaining security/performance advisor findings and verify every identity/reference table policy before enabling browser onboarding.
7. Keep PR #35 in Draft and keep production on its existing database until these gates pass.

**Decision:** the backend V2 boundary and live database hardening are materially in place, but this is not a complete user-facing V2 product and is not merge-ready. The safe WhatsApp compatibility path has now been neutralized and regression-guarded; authenticated onboarding/workspace, Ellie adaptation, complete dependency retirement and runnable validation remain outstanding.
