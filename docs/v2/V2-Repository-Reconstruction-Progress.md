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

Action implementation is now applied to the V2 database through migrations 015–018. Migration 015 established the tables, RLS, permissions, transitions, and history; 016 corrected the trusted system-execution and Attempt lifecycle path; 017 corrected system-role detection inside SECURITY DEFINER trigger functions; 018 decoupled historical Action actor references from mutable membership rows. The live database records all four migrations.

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

## 8. Market operating-model review gate

The repository architecture has now been revised to treat organization operating model as a first-class V2 concern.

Added:

- `docs/v2/V2-Market-Operating-Model-and-Responsibility-Spec.md`
- revised `docs/v2/V2-Domain-and-Tenancy-Blueprint.md`
- revised `docs/v2/V2-Domain-to-Schema-Design.md`

Resolved direction:

- Enerlectra is Lusaka-first, not EPC-only.
- The four previously interviewed organizations are discovery evidence, not the market definition.
- Organizations may combine multiple business activities and operating models.
- Business-model archetypes are classifications/context, not separate products or schemas.
- Business activities, customer segments, ownership model, service responsibilities, payment model, capabilities, responsibility scope, and policies are separate dimensions.
- Ownership is distinct from operational responsibility.
- Capability is distinct from actor permission.
- Role is not a job title; job titles must not become the authorization architecture.
- Responsibility scope is a separate design concern from role/permission.
- Bounded workflow configuration is allowed; a generic no-code workflow engine is not.
- Current roles remain temporarily valid. No Migration 019 role rename is authorized yet.
- Work Item migrations 009–014 remain frozen.
- Action migrations 015–018 remain frozen unless a concrete defect is discovered.

The next architecture gate is to validate this operating model against materially different distributed-energy operating patterns before further role/schema changes. The target patterns are installation/service, PAYGo/recurring service, C&I/portfolio operation, distributor/equipment service, and maintenance/field service.



## 9. Operating-model validation completed

Added docs/v2/V2-Operating-Model-Validation-Matrix.md.

The model was tested conceptually against five materially different operating patterns: installation/service, PAYGo/recurring service, C&I/portfolio operation, distributor/equipment service, and maintenance/field service.

Result: no pattern requires a separate product or business-model-specific schema. The strongest unresolved structural dimension is operational responsibility scope: who is responsible for what, within which bounded scope.

The next implementation gate is therefore the minimum persisted model for Operating Profile, capabilities, and responsibility scope. Role replacement remains deferred. Work Item migrations 009–014 and Action migrations 015–018 remain frozen.

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

The next implementation gate is the **Market Operating Model / Responsibility review**. No new migration should be created until that review establishes which operating-profile and responsibility dimensions are actually required by the first Lusaka pilot.

After that gate, implementation resumes with the minimum schema changes required by evidence, followed by authenticated integration tests and one real operational vertical slice.


## 10. Customer Operational Issue workflow validated

Added:

- `docs/v2/V2-Customer-Operational-Issue-Workflow.md`

The Solar Move Africa interview with Mary Lengwe Katebe supplied a real end-to-end customer incident involving a well pump: customer report, context identification, equipment mismatch, independent installation, subsequent failure, technician referral, inspection evidence, warranty/responsibility consideration, consequential replacement decision, and customer restoration.

The interview also identifies fragmented customer-fault intake and routing as a recurring operational problem, while distinguishing that problem from technical monitoring.

The workflow is therefore defined as:

```
SIGNAL / REPORT
→ INTAKE
→ IDENTIFY CONTEXT
→ INVESTIGATE
→ SITUATION
→ DETERMINE RESPONSE
→ WORK
→ ACTION / INTERVENTION
→ EVIDENCE
→ VERIFY
→ RESOLVED / ESCALATED / REOPENED
```

Cross-operator evidence remains compatible with the same kernel:

```
Observation → Event → Situation → Work Item → Action / Attempt → Evidence → Verification
```

The Solar Move evidence does not establish a recurring territory, customer-portfolio, asset-portfolio, branch, or service-region responsibility boundary. The first workflow can therefore use the existing `work_items.assigned_actor_id` as the concrete responsibility boundary.

### Current gate decision

The workflow boundary is now implemented as an application service and HTTP route. The first production requirement exposed by implementation was atomicity: the signal, observation, event, situation, and work item must commit or roll back together. That requirement is now represented by Migration 019; no new domain abstraction was introduced.

The next work is authenticated integration testing and cross-operator validation. A detailed Lusaka incident should still be collected if it exposes a responsibility boundary that cannot be represented by direct work assignment.

The principle remains:

> Persist the smallest domain boundary required by a real operational workflow. Do not persist an abstraction merely because it may become useful at scale.


## 11. Atomic Customer Operational Issue transaction implemented

Migration 019_customer_operational_issue_transaction has been applied to the V2 database.

Implementation:

- create_customer_operational_issue owns the transaction boundary for the first operational slice.
- The service now performs one RPC instead of four independent inserts.
- Observation, Event, Situation, Situation-to-Event linkage, and Work Item are created in one database transaction.
- Existing Work Item integrity/history triggers remain authoritative.
- Organization and actor membership are validated inside the transaction.
- situation.manage, work.execute, and conditional work.assign permissions are enforced.
- Assigned actors must be active members of the same organization.
- Organization-scoped Work Item idempotency returns the existing operational chain on retry.
- The SECURITY DEFINER RPC is executable only by service_role; anon and authenticated cannot invoke it directly.
- A transaction-local app.actor_id context preserves the existing actor-derived Work Item trigger semantics for trusted server execution.
- No Action authorization or execution is performed by this workflow.

The migration source is committed at supabase/migrations/20260922150000_019_customer_operational_issue_transaction.sql.

Validation status: database migration applied and function grants verified. Full authenticated end-to-end execution remains pending because repository CI is currently blocked by the GitHub account billing/spending-limit condition; no CI pass is being claimed.
