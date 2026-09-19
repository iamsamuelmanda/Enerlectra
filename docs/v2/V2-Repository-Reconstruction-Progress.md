# V2 Repository Reconstruction Progress

## Target

Enerlectra remains one application. The existing repository is being progressively reconstructed around the V2 operational domain. V2 is not a second permanent application.

- Active target database: `enerlectra-v2`
- Legacy database: `enerlectra-prod`, unchanged during reconstruction
- Legacy V1 domain: temporary source/reference only
- No permanent `client/v1`, `client/v2`, `server/v1`, or `server/v2` split

## Completed gates

### 1. Platform / Identity Boundary

Implemented:

- V2-only server configuration at `server/src/platform/config/v2.ts`.
- Server-only V2 Supabase admin client at `server/src/platform/supabase/v2-admin.ts`.
- V2 tenant-context contract at `server/src/platform/tenant/context.ts`.
- Transitional V2 browser client at `client/src/lib/supabase-v2.ts`.
- V2 environment placeholders.
- Repository boundary tests.

Security properties:

1. V2 server configuration reads only V2 server credentials.
2. Missing V2 server variables fail closed.
3. Browser configuration accepts only V2 public/publishable credentials.
4. No service-role credential is present in the browser module.
5. Tenant context is explicit and client-supplied organization identifiers are not authorization proof.
6. V2 platform modules contain no imports of quarantined legacy domains.

### 2. Authenticated Tenant Context

Implemented:

`access token → auth.users identity → actor → active membership → active organization → role → permissions → TenantContext`

The resolver:

- verifies the Supabase access token;
- requires an ACTIVE actor;
- requires an ACTIVE organization membership;
- rejects invited, suspended, and revoked memberships;
- requires explicit organization context when the actor has multiple active memberships;
- requires an ACTIVE organization;
- resolves role-derived permissions;
- never treats a channel-supplied organization identifier as authorization evidence.

Executable tests cover successful resolution, forged organization context, inactive actors, and ambiguous memberships.

### 3. Customer / Site / Asset Foundation

Implemented:

- V2 `customers`, `sites`, and `assets`.
- Direct `organization_id` on every operational table.
- Tenant/relationship indexes.
- Status and integrity constraints.
- Forced RLS with permission-gated CRUD.
- Composite tenant-scoped foreign keys preventing cross-organization customer/site/asset relationships.

Applied migrations:

1. `001_foundation`
2. `002_foundation_security_hardening`
3. `003_customer_site_asset_foundation`
4. `004_customer_site_asset_tenant_integrity`

### 4. Evidence / Events Foundation

Implemented in migration `005_evidence_events_foundation`.

Domain distinction is explicit:

`Observation = evidence received/observed about reality`

`Event = normalized fact recognized by Enerlectra as having happened`

`Situation = contextual interpretation of facts` (future gate)

#### Observations

The observation record captures:

- organization and optional actor;
- source/channel;
- observation type;
- observed and received timestamps;
- optional customer/site/asset subject;
- structured value;
- provenance;
- raw source reference;
- correlation ID.

Observations are append-only domain evidence.

#### Events

The event record captures:

- organization and optional actor;
- normalized event type;
- occurred and recorded timestamps;
- source;
- optional customer/site/asset subject;
- optional source observation;
- structured payload;
- provenance;
- correlation ID;
- causation ID.

Events are append-only normalized facts.

#### Traceability

Events can point back to their source observation through a tenant-scoped foreign key. Correlation and causation identifiers provide the basis for tracing a larger operational chain.

#### Tenant/security boundary

Both tables:

- carry a direct non-null `organization_id`;
- use tenant-scoped composite foreign keys for customer/site/asset references;
- have forced RLS;
- expose only permission-gated SELECT and INSERT policies;
- grant only SELECT/INSERT to authenticated users;
- deliberately have no UPDATE/DELETE policies, establishing the append-only boundary.

The target database was verified after migration: both tables have RLS enabled and forced, with only their SELECT/INSERT policies present.

The Supabase security advisor currently reports only the previously intentional `public.create_organization(text)` SECURITY DEFINER warning from the foundation; no new warning was introduced by the evidence/event migrations. Authenticated table privileges were also verified to be limited to SELECT and INSERT for observations/events.

## Current domain position

The operational path is now:

Identity → Organization → Role / Permissions → Membership → Tenant Context → Customer → Site → Asset → Observation → Event → Situation → Work Item

The reconstruction has crossed the boundary from recognizing operational situations to organizing accountable operational response.

### 5. Situation / Incident Foundation

Implemented in migrations:

1. 007_situation_foundation
2. 008_situation_history_integrity

A Situation is a mutable, tenant-scoped operational interpretation supported by immutable events.

Implemented:

- situations with bounded status and severity;
- situation-to-event evidentiary links;
- append-only situation status history;
- automatic history on creation and status transitions;
- tenant-scoped customer/site/asset relationships;
- forced RLS and permission-gated access;
- authenticated clients cannot directly manufacture situation history.

The Situation model deliberately does not claim diagnosis or resolution merely because a report exists.

### 6. Work Item / Operational Execution Foundation

Implemented in migrations:

1. 009_work_item_foundation
2. 010_work_item_integrity_history
3. 011_work_item_privilege_hardening
4. 012_private_rls_helper_execute

A Work Item is an authorized unit of operational work created to move a situation toward a verifiable outcome.

Implemented:

- tenant-scoped work_items;
- situation linkage through composite tenant foreign keys;
- optional tenant-consistent customer/site/asset subjects;
- bounded work types, statuses, and priorities;
- active same-organization assignee enforcement;
- explicit lifecycle transition enforcement;
- creator derived from authenticated actor context;
- organization-scoped idempotency;
- append-only work_item_history;
- trigger-owned history for creation, assignment, start, completion, and cancellation;
- terminal-state immutability;
- work completion does not resolve the Situation.

Security verification:

- work_items RLS enabled and forced;
- work_item_history RLS enabled and forced;
- authenticated work access is limited to SELECT/INSERT/UPDATE on work_items and SELECT on work_item_history;
- no authenticated DELETE grant or delete policy exists;
- cross-tenant situation/assignee attempts were rejected;
- suspended/revoked assignees were rejected;
- direct history insertion was rejected;
- tenant A could not see tenant B work;
- duplicate organization/idempotency keys were rejected;
- completed work left the Situation OPEN.

A privilege issue discovered during authenticated-path testing was corrected: the private security-definer RLS helper functions now have EXECUTE for authenticated policy evaluation while remaining non-public and non-anon. This is tracked in migration 012.

The Supabase security advisor remains limited to the previously intentional public.create_organization(text) SECURITY DEFINER warning. Performance advisor findings are pre-existing/index observations and were not expanded into unrelated cleanup during this gate.

## Next gate

**Action / Execution foundation.**

Do not build Ellie, console/UI, WhatsApp/Telegram adapters, telemetry, verification, marketplace, PCU, wallets, clusters, settlement, or a generic workflow engine yet.

Action is the next architectural boundary because it represents something actually executed in the operational world. It must therefore be designed separately from Work Item and separately from Verification.

Target path:

Observation → Event → Situation → Work Item → Action / Execution → Evidence → Verification → Situation update

Stop for an architectural review after Action / Execution before implementing Verification.
