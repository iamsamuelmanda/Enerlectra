# V1 → V2 Repository Dependency Map

Status: READ-ONLY FORENSIC MAP
Date: 2026-09-18
Repository: iamsamuelmanda/Enerlectra
Default branch: main

## 1. Purpose

This document maps the existing Enerlectra repository before cleanup. It does not authorize deletion, renaming, migration, or repointing of the V1 application.

The repository contains both reusable platform infrastructure and legacy V1 energy-market domain logic. V2 must selectively reuse infrastructure while preventing legacy domain concepts from becoming V2 dependencies.

## 2. Classification

- KEEP — reusable with no material domain rewrite.
- ADAPT — valuable, but tenant/domain/security semantics must change.
- ISOLATE — retain for legacy/reference/integration use, but V2 must not depend on it.
- RETIRE — remove after runtime/deployment dependencies are proven absent.
- UNKNOWN — requires deeper execution/runtime validation before classification.

## 3. High-level map

| Area | Classification | V2 treatment |
|---|---|---|
| TypeScript / Node / Express foundation | KEEP / ADAPT | Reuse runtime and server foundation |
| React/Vite client | KEEP / ADAPT | Reuse shell/components selectively; rebuild V2 navigation/features |
| Supabase JS dependency | KEEP | Reuse package; introduce explicit V2 client boundary |
| Existing V1 Supabase clients | ISOLATE | Do not repoint; preserve while V1 exists |
| Identity / channel resolution | ADAPT | Map to Actor + Membership + Channel Identity |
| Event metadata / event bus | ADAPT | Reuse after tenant context and V2 event semantics are enforced |
| Command contracts | ADAPT | Reuse authorization-aware intent pattern |
| Workflow/execution context | ADAPT | Make organization context mandatory; remove defaults |
| WhatsApp adapter | ADAPT | Keep channel adapter; route into V2 operational kernel |
| Telegram adapter | ISOLATE | Retain as optional adapter until V2 use is validated |
| Ellie | ADAPT | Rebuild data access/context around V2 bounded context |
| Customers | ADAPT | V2 customer entity, organization-scoped |
| Assets | ADAPT | V2 asset entity under first-class Sites |
| Events | ADAPT | Normalize as V2 evidence/occurrence model |
| Alerts | ADAPT / RETIRE | Alert is not a Situation; retain only if needed as presentation/notification |
| Work orders | REBUILD / ADAPT | Replace cluster-shaped work orders with V2 Work Items |
| Tickets/support tickets | REBUILD | Consolidate into V2 operational work/support semantics |
| Communication messages | ADAPT | Preserve as tenant-scoped communication evidence |
| PCU | ISOLATE / RETIRE | Never a V2 core dependency |
| Wallets | ISOLATE / RETIRE | Never a V2 core dependency |
| Clusters | ISOLATE / RETIRE | Never a V2 core dependency |
| Ownership shares | ISOLATE / RETIRE | Never a V2 core dependency |
| Marketplace/listings/requests | ISOLATE / RETIRE | Never a V2 core dependency |
| Matching/trades | ISOLATE / RETIRE | Never a V2 core dependency |
| Staking | ISOLATE / RETIRE | Never a V2 core dependency |
| Legacy settlement/treasury | ISOLATE | Reintroduce only as bounded financial capability when validated |
| Blockchain | ISOLATE / RETIRE | Not in first V2 implementation |
| Logging/metrics/CI/deployment | KEEP / ADAPT | Preserve platform value |
| Legacy docs/security claims | ISOLATE | Historical evidence, not V2 architecture |

## 4. Database-client boundary

Current repository contains multiple Supabase client patterns:

### Frontend
`client/src/lib/supabase.ts`
- Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Contains V1 domain interfaces including MeterReading, Cluster, ClusterMember, Contribution, LedgerEntry and PriceOracle.
- Contains realtime subscription to `meter_readings`.
- Therefore: ADAPT the client boundary; do not simply repoint this file to V2.

### Core service client
`enerlectra-core/src/lib/supabase.ts`
- Uses `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
- Loads root/server .env files.
- Creates a service-role client.
- Therefore: ISOLATE for V1; create a distinct V2 server client with explicit V2 environment variables and a clear service-role boundary.

### JWT-scoped server client
`enerlectra-core/src/lib/supabaseServer.ts`
- Uses `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- Can attach a caller JWT.
- Conceptually reusable for V2, but environment names and authorization context must be adapted.

### Required invariant

V2 configuration must be separately named. Existing V1 variables must not silently change meaning.

Recommended direction:
- `V2_SUPABASE_URL`
- `V2_SUPABASE_PUBLISHABLE_KEY`
- `V2_SUPABASE_SERVICE_ROLE_KEY` (server-only; never commit the value)

No V2 browser code may import a legacy V1 Supabase client.

## 5. Identity / tenancy dependency map

Reusable concepts found in the repository:
- actor/user identifiers
- organization identifiers
- channel identities
- execution context
- event actor/organization metadata
- command actor/organization metadata

Critical legacy risks:
- some paths use `user_id` directly where V2 requires Actor.
- repository code contains a `default-org` fallback in command creation.
- payment webhook code has tenant identification based on request headers/fallback behavior.
- existing DB has both `organizations` and `organisations`.

V2 action:
- Actor is canonical application identity.
- Membership establishes organizational authority.
- Channel identity identifies an actor/channel, not authorization.
- No `default-org` fallback.
- Tenant context must be established and verified before DB access or event publication.

## 6. Event / command / workflow infrastructure

### Reusable
`enerlectra-core/src/core/eventing/`
- event publisher
- event bus
- event store
- event router
- event types

`enerlectra-core/src/core/contracts/`
- command contracts

`enerlectra-core/src/core/workflow/`
- workflow/execution context

These contain useful infrastructure aligned with V2:
- actor ID
- organization ID
- correlation ID
- causation ID
- timestamp/version metadata
- explicit command source/initiator

### Required adaptation

The V2 event path should become:

Observation → Event → Situation → Recommendation → Authorized Command → Action/Work → Verification → New Evidence.

The infrastructure must not assume:
- PCU
- clusters
- marketplace
- settlement
- wallets
- staking

The repository also has evidence that the code's event store targets `event_log`, while the legacy live DB exposes `events`. This is code/database drift and must be resolved only inside V2 rather than patched into the legacy system.

## 7. Ellie dependency map

Relevant paths:
- `enerlectra-core/src/ai/ellie.ts`
- `enerlectra-core/src/domain/intelligence/workers/ellie-worker.ts`
- `enerlectra-core/src/domain/intelligence/workers/context-builder.ts`
- WhatsApp webhook/sender adapters
- operator bot menus and dashboard integrations

Reusable:
- operator-facing assistant concept
- message ingestion
- execution context
- event/workflow invocation
- channel adapter
- bounded context idea

V2 adaptation:
Ellie must receive only:
- authenticated actor context
- active organization membership
- role/permissions
- operating model
- enabled capabilities
- organization policies
- authorized operational evidence

Ellie must not have unrestricted direct database access and must not authorize itself.

## 8. Communication/channel map

### WhatsApp
Relevant adapter paths include:
- `enerlectra-core/src/adapters/whatsapp/sender-adapter.ts`
- `enerlectra-core/src/adapters/whatsapp/sender.ts`
- `enerlectra-core/src/adapters/whatsapp/webhook-handler.ts`

Classification: ADAPT.

Required V2 flow:
channel identity → Actor → active Membership/organization context → Observation/Event → V2 workflow.

### Telegram
Existing integration includes operator menus and customer/operator actions.

Classification: ISOLATE initially. It can be reconnected after the V2 operational kernel is proven.

## 9. Legacy domain dependency clusters

### PCU / wallet cluster
Examples found include:
- `energy_wallets`
- `pcu_balances`
- `pcu_logs`
- `pcu_mints`
- `pcu_transfers`
- redemption/transfer services and routes

Classification: ISOLATE / RETIRE.

### Cluster economy
Examples:
- clusters
- cluster members
- contributions
- snapshots
- ownership snapshots
- unit energy shares
- cluster funding/yield routes

Classification: ISOLATE / RETIRE.

### Marketplace
Examples:
- energy listings
- energy requests
- energy trades
- matching engine
- allocations

Classification: ISOLATE / RETIRE.

### Settlement / treasury
Examples:
- settlements
- settlement ledger/events/results/payouts
- treasury operations/reservations/reconciliations/snapshots
- financial accounts and ledger entries
- Lenco payout paths

Classification: ISOLATE.

These capabilities may become future bounded financial capabilities, but they are not prerequisites for the first V2 operational slice.

### Staking / blockchain
Classification: ISOLATE / RETIRE from V2 core.

## 10. Existing operational domain

### Customers
Existing customer paths are reusable conceptually.

V2 change:
`Organization → Customer` remains valid, but infrastructure must not be forced through the customer. V2 introduces:

Organization → Customers
Organization → Sites → Assets

### Assets
Existing assets are useful evidence of domain work, but legacy schema is customer-centric and lacks a first-class Site.

V2:
- organization_id
- site relationship
- customer relationship where applicable
- asset identity/status
- operational evidence/work linkage

### Events
Existing event infrastructure is valuable, but event types must be normalized around V2 operational semantics.

### Alerts
Keep only as a presentation/notification concept where useful. Do not equate Alert with Situation.

### Work orders
Current work orders contain cluster-oriented fields such as cluster_id and contractor_name. They should not be carried forward as-is.

V2 replacement:
Work Item + assignments + evidence + actions + verification.

### Tickets
The repository/live DB contain both ticket/support-ticket concepts. V2 should not reproduce both. Support is an operational workflow/use case, not two competing core entities.

### Communication messages
Strong candidate for reuse after tenant scoping and V2 actor/channel mapping.

## 11. Frontend map

The existing client contains V1 pages/components tied to:
- clusters
- wallets
- marketplace
- protocol/global state
- ownership/economic concepts

Those screens should be classified as ISOLATE/RETIRE from the V2 navigation.

The V2 client should be rebuilt around operator workflows:
- organization context
- operational dashboard
- customers
- sites
- assets
- situations/incidents
- work
- recommendations
- verification
- communication
- Ellie

Existing visual/component infrastructure can be selectively reused.

## 12. Runtime/deployment

`render.yaml` currently describes:
- backend
- Ellie/Telegram bot
- free Render plans
- environment/deployment configuration

Classification: KEEP / ADAPT.

Do not assume deployment is V2-connected merely because the repository contains V2 migrations. Runtime secrets must be configured separately in the deployment environment.

## 13. Critical blockers before cleanup

1. Remove all possibility of V2 importing legacy domain modules.
2. Establish explicit V2 Supabase client boundary.
3. Establish V2 tenant-context middleware/context object.
4. Remove `default-org` semantics from V2 paths.
5. Establish authenticated cross-tenant integration tests.
6. Build V2 customer/site/asset migration and repositories.
7. Only then begin deleting unreachable V1 domain code.

## 14. What this map proves

The repository is a reusable codebase, not a clean V2 codebase.

The correct strategy is therefore:

REPOSITORY
  ├── reusable platform infrastructure → V2
  ├── reusable integrations → V2 selectively
  └── legacy energy-market domain → isolate

The old PCU/cluster/marketplace implementation is not a reason to discard the repository. It is a reason to establish explicit dependency boundaries before cleanup.

## 15. Validation still required

This is a static repository map. Before deleting or moving anything, validate:
- runtime import reachability
- build/test dependencies
- Render deployment entry points
- scheduled jobs
- webhook routes
- environment variable consumers
- external integrations
- database objects used at runtime
- production V1 traffic

No destructive cleanup is authorized by this document.
