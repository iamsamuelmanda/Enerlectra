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

The Supabase security advisor currently reports only the previously intentional `public.create_organization(text)` SECURITY DEFINER warning from the foundation; no new warning was introduced by migration 005.

## Current domain position

The operational path is now:

`Identity → Organization → Role / Permissions → Membership → Tenant Context → Customer → Site → Asset → Observation → Event`

This is the point where Enerlectra moves from establishing **who is allowed to operate** toward establishing **what happened in the operational world**.

## Next gate

**Situation / Incident foundation.**

The next stage should consume normalized events and evidence and establish contextual operational situations without turning derived interpretation into authoritative state.

Target path:

`Observation → Event → Situation → Diagnosis → Work Item → Action → Verification → New Evidence`

Do not build yet:

- configurable console;
- Ellie intelligence engine;
- WhatsApp/Telegram product adapters;
- marketplace/P2P trading;
- generic workflow/no-code engine;
- new business-model-specific databases or modules;
- universal financial ledger as system-wide source of truth.

The console and channel adapters come after the operational primitives are stable enough for them to become adapters over the same domain.
