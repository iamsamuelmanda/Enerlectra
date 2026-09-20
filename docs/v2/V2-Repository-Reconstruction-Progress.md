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

Implemented in migrations `005_evidence_events_foundation` and `006_evidence_events_append_only_hardening`.

Domain distinction:

`Observation = evidence received/observed about reality`

`Event = normalized fact recognized by Enerlectra as having happened`

`Situation = contextual interpretation of facts`

Observations and Events are tenant-scoped and append-only. Events can reference source observations; correlation and causation identifiers provide traceability.

Both tables:

- carry non-null `organization_id`;
- use tenant-scoped subject foreign keys;
- have forced RLS;
- expose only permission-gated SELECT/INSERT;
- have no authenticated UPDATE/DELETE capability.

### 5. Situation / Incident Foundation

Implemented in migrations:

1. `007_situation_foundation`
2. `008_situation_history_integrity`

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

1. `009_work_item_foundation`
2. `010_work_item_integrity_history`
3. `011_work_item_privilege_hardening`
4. `012_private_rls_helper_execute`
5. `013_work_item_fk_indexes`
6. `014_work_item_subject_fk_indexes`

A Work Item is the unit of accountable operational work created to move a Situation toward a verifiable outcome.

Implemented:

- tenant-scoped work items;
- situation linkage through composite tenant foreign keys;
- optional tenant-consistent customer/site/asset subjects;
- bounded work types, statuses, and priorities;
- active same-organization assignee enforcement;
- explicit lifecycle transition enforcement;
- creator derived from authenticated actor context;
- organization-scoped idempotency;
- append-only work-item history;
- trigger-owned history for creation, assignment, start, completion, and cancellation;
- terminal-state immutability;
- work completion does not resolve the Situation.

Security verification established forced RLS, permission-gated authenticated access, no authenticated delete capability, cross-tenant relationship protection, assignee membership checks, append-only history, idempotency enforcement, and separation between Work completion and Situation resolution.

**Work Item is frozen. Do not modify migrations 009–014 unless a concrete defect is discovered.**

### 7. Action / Execution Semantic Design

The initial semantic design and architectural review are complete.

Documents:

- `docs/v2/V2-Action-Execution-Semantic-Design.md`
- `docs/v2/V2-Action-Execution-Architecture-Review.md`
- `docs/v2/V2-Action-Security-and-State-Machine-Freeze.md`

The Action security/state-machine gate is now frozen.

Core decisions:

- Action creation, authorization, and execution are distinct authority boundaries.
- `action.create` is separate from `action.authorize`.
- Creating an Action always produces PROPOSED; it never authorizes.
- Authorization is an auditable decision with consequential fields frozen afterward.
- Action lifecycle is PROPOSED → AUTHORIZED → EXECUTING → SUCCEEDED / FAILED / EXECUTION_UNKNOWN, with explicit cancellation and controlled reconciliation from UNKNOWN.
- Action Attempts are first-class and have their own lifecycle.
- Retries create new Attempts under the same logical Action.
- Action does not contain authoritative executor identity; executor identity belongs to Attempts.
- HUMAN and SYSTEM executor types are distinct; system execution requires a trusted server-side execution principal.
- Logical Action idempotency and Attempt execution idempotency are separate.
- Action History is append-only and client-write-prohibited.
- Execution results remain execution facts and do not directly establish domain recovery.
- Ellie cannot self-authorize or directly execute.
- Tenant isolation applies to Actions, Attempts, authorization, execution, history, AI context, jobs, webhooks, and external adapters.
- Work Item migrations 009–014 remain frozen.
- No generic workflow engine or autonomous execution framework is introduced.

### Action design gate status

**FROZEN — approved for implementation.**

Action implementation is now applied to the V2 database through migrations 015–017. Migration 015 established the tables, RLS, permissions, transitions, and history; 016 corrected the trusted system-execution and Attempt lifecycle path; 017 corrected system-role detection inside SECURITY DEFINER trigger functions. The live database records all three migrations.

## Current domain position

```
Identity
  → Organization
  → Role / Permissions
  → Membership
  → Tenant Context
  → Customer
  → Site
  → Asset
  → Observation
  → Event
  → Situation
  → Work Item
  → Action / Execution
  → Evidence
  → Verification
  → Situation / Work update
```

## Explicitly deferred

Do not build yet:

- Ellie;
- configurable console/UI;
- WhatsApp/Telegram adapters;
- telemetry;
- Verification;
- marketplace;
- PCU;
- wallets;
- clusters;
- settlement;
- generic workflow engine;
- autonomous AI execution.

The next implementation gate is **Migration 015: Action / Execution foundation**. It must include the frozen state machine, tenant/RLS boundaries, permission separation, idempotency, trusted system executor representation, append-only history, and authenticated tenant-boundary tests.
