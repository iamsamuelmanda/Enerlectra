# V2 RLS, Tenant Isolation & Attack Model

## 1. Purpose

This document is the security contract for Enerlectra V2 multi-tenancy. It defines how tenant context is established, propagated, enforced, and tested across the platform.

It is derived from:
- `docs/v2/V2-Domain-and-Tenancy-Blueprint.md`
- `docs/v2/V2-Domain-to-Schema-Design.md`

This document does not authorize changes to the legacy Supabase project and does not constitute SQL.

## 2. Security invariant

**Organization is the tenant boundary. An actor may access organization-scoped data only through an active membership that grants authority for that organization and resource/action.**

Fail closed when tenant context, membership, or authorization cannot be established.

A client-supplied `organization_id` is data, not proof of authorization.

## 3. Authorization chain

The canonical chain is:

```
Actor
  ↓
Authenticated identity
  ↓
Membership
  ↓
Organization
  ↓
Role / permission
  ↓
Resource.organization_id
  ↓
Authorized operation
```

Actor, customer, organization, and channel identity remain distinct concepts.

An actor may have memberships in multiple organizations. Therefore an active organization context must always be resolved and verified; it must never be inferred from the actor alone.

## 4. Tenant context lifecycle

### Browser / API

```
Request
→ authenticate actor
→ resolve authorized organization context
→ resolve role/permissions
→ execute service operation
→ database enforces organization boundary
→ return only authorized data
```

The API may accept an organization selector for UX/context selection, but the server must verify that the authenticated actor has an active membership in that organization.

### WhatsApp / Telegram / other channels

```
Inbound channel identity
→ resolve Actor
→ resolve active membership(s)
→ resolve organization context
→ authorize requested operation
→ execute
```

A channel external ID identifies an actor/channel identity. It does not itself establish tenant authority.

### Webhooks

A webhook must use a trusted provider binding, credential, signature, endpoint mapping, or equivalent server-controlled association to determine its organization context.

The following is insufficient by itself:

```
x-organization-id: customer-supplied-value
```

Unknown or unverifiable tenant bindings are quarantined and produce no tenant-scoped operational record.

### Background jobs

Every organization-scoped job carries explicit tenant context.

Jobs must:
- establish context before database access;
- process only that organization's records;
- avoid mutable global tenant state;
- reset/destroy context after execution;
- record organization and correlation identifiers for auditability.

### Storage

Organization-owned files must have an organization-scoped storage path and authorization check. Object names or client-supplied paths are not authorization.

### Ellie / AI

Ellie receives bounded context:

```
Actor
Organization
Membership / role
Operating model
Capabilities
Policies
Relevant authorized records
```

Retrieval must be organization-scoped before information reaches the model. Prompts, embeddings, caches, tool calls, conversation state, and generated exports must preserve tenant boundaries.

Ellie cannot use unrestricted database access as its security boundary.

## 5. Data classification

### Platform-owned
- platform configuration
- deployment metadata
- system health
- platform-level operational telemetry

### Organization-owned
- customers
- sites
- assets
- observations
- events
- situations
- work
- recommendations
- communications
- contracts
- organization configuration
- operational evidence

### Actor-owned
- actor identity
- channel identities
- personal preferences

### Shared/reference
- equipment manufacturers
- equipment types
- countries
- currencies
- standard classifications

### Cross-tenant analytics

Only aggregated/anonymized data explicitly permitted by product policy may cross tenant boundaries. Raw customer, asset, event, work, communication, or evidence data must not leak into another tenant's analytics or AI context.

## 6. RLS invariants

Every tenant-owned table:

1. Has a non-null `organization_id`.
2. References the canonical `organizations` tenant.
3. Has RLS enabled.
4. Uses explicit policies for every required operation.
5. Checks active membership/authorization rather than trusting request parameters.
6. Prevents tenant ID tampering on INSERT and UPDATE.
7. Uses fail-closed behavior when organization context is absent.
8. Has indexes supporting tenant-scoped access.
9. Prevents parent/child tenant mismatches.

Conceptually:

```
SELECT  → resource.organization_id belongs to authorized organization
INSERT  → new organization_id belongs to authorized organization
UPDATE  → existing AND resulting organization are authorized
DELETE  → existing resource belongs to authorized organization
```

RLS is necessary but not sufficient. Application authorization, role checks, storage controls, job isolation, webhook binding, and AI retrieval controls remain required.

## 7. Role model

Roles represent authority within an organization.

A role is not the same as:
- business model;
- capability;
- customer;
- channel;
- ownership of an asset.

Initial role vocabulary should remain small and explicit, for example:
- organization owner/admin
- operations manager
- operator/support
- field technician
- finance/reconciliation
- read-only/auditor

Exact role names and permissions remain subject to vertical-slice validation.

Least privilege applies:
- read access only where needed;
- write access only where needed;
- consequential actions require explicit permission;
- organization configuration requires elevated authority;
- financial/reconciliation actions are separately authorized.

## 8. Service-role boundary

Supabase service-role credentials bypass normal RLS protections and therefore are backend infrastructure credentials, not application authorization.

Requirements:
- never expose service-role credentials to browsers or channels;
- use only from controlled backend processes;
- wrap privileged operations in explicit authorization checks;
- minimize privileged code paths;
- log actor, organization, reason, operation, and correlation ID where applicable;
- review privileged functions/RPCs;
- do not use service role as a convenience mechanism to avoid designing tenant authorization.

## 9. Parent-child tenant integrity

Tenant consistency must be enforced across relationships.

Examples:

```
Organization
  └── Customer
       └── Site
            └── Asset
                 └── Work
```

A record from Organization A must never reference a parent record from Organization B.

The system must reject combinations such as:

```
work_item.organization_id = A
asset.organization_id    = B
```

even if both UUIDs are otherwise valid.

The preferred design is to make tenant ownership explicit on each tenant-scoped resource and validate cross-resource organization consistency.

## 10. Attack matrix

Use at least two isolated test tenants:

```
Organization A: DS Solar Test
Marker: DS-SOLAR-SECRET-001

Organization B: Renwasol Test
Marker: RENWASOL-SECRET-002
```

Test identities:

```
Actor A-admin       → active member of A
Actor A-operator    → restricted member of A
Actor B-admin       → active member of B
Actor X             → no organization membership
Revoked A-operator  → membership removed
Backend worker      → controlled server identity
```

| Test | Expected result |
|---|---|
| A-admin reads A customer | Allowed |
| A-admin reads B customer | No row / denied |
| A-admin reads B customer by direct ID | No row / denied |
| A-admin lists B assets | Empty/denied |
| A-admin inserts customer with B organization_id | Rejected |
| A-admin changes A asset organization_id to B | Rejected |
| A-admin updates B work item by guessed ID | No effect / denied |
| A-operator performs admin-only configuration change | Rejected |
| Actor X accesses A data | Rejected |
| Revoked member accesses A data | Rejected immediately |
| B-admin reads A data | No row / denied |
| Webhook claims arbitrary tenant ID | Not trusted |
| Unknown webhook tenant | Quarantined; no tenant record |
| Ellie in A context asks for B data | No B data returned |
| A export includes B records | Must be impossible |
| A job accidentally receives B record ID | Record rejected by tenant check |
| Parent A + child B relationship | Rejected |
| Service-role path is called by browser | Impossible |
| Privileged backend action without authorization | Rejected |
| Tenant context missing | Fail closed |

## 11. IDOR and enumeration tests

Resource UUID secrecy is not a security control.

For every tenant resource, test:
- valid A ID requested by A → allowed;
- valid B ID requested by A → denied/no row;
- guessed/random ID → no disclosure;
- B ID in nested route → denied;
- B ID in query filter → denied;
- B ID in bulk request → denied;
- B ID in export → excluded.

Error behavior should avoid leaking whether an unauthorized resource exists where practical.

## 12. Write-path tampering

Test every tenant-owned INSERT and UPDATE with:
- correct organization ID;
- another organization's ID;
- null organization ID;
- missing organization ID;
- mismatched parent organization;
- changed organization ID during update.

Only the first valid case should succeed when the actor is authorized.

## 13. Membership revocation

Security must not depend on stale client state.

Test:

```
Actor A → active membership → access
       ↓
membership revoked
       ↓
same token/session attempts access
       ↓
access denied
```

The authorization mechanism must account for membership status according to the chosen session/cache model.

## 14. RPC, views, and SECURITY DEFINER risks

V2 must explicitly review every RPC and view that can access tenant data.

For SECURITY DEFINER functions:
- minimize their number;
- pin/secure execution context;
- validate actor and organization authorization;
- avoid accepting organization IDs as authority;
- restrict EXECUTE privileges;
- test direct invocation;
- audit consequential mutations.

Views must not accidentally bypass intended tenant controls. Any privileged view must have a documented exposure model.

## 15. Logs, analytics, caches, and exports

Tenant isolation applies outside PostgreSQL tables.

Do not allow:
- mixed-tenant AI context;
- shared unscoped cache keys;
- reports without organization filters;
- logs containing another tenant's customer data in application responses;
- exports assembled from global queries;
- background aggregation that exposes raw tenant data.

Every cache, export, report, and asynchronous task needs an explicit data-scope model.

## 16. Testing strategy

Security tests must execute under realistic authenticated identities.

Do not rely only on:
- SQL Editor sessions with elevated privileges;
- service-role credentials;
- unit tests that mock authorization away.

Minimum test layers:

1. Database RLS tests.
2. Authenticated API integration tests.
3. Channel/webhook authorization tests.
4. Background-job isolation tests.
5. Storage isolation tests.
6. Ellie retrieval/tool authorization tests.
7. Role/permission tests.
8. Membership-revocation tests.
9. IDOR/direct-ID tests.
10. Tenant-ID tampering tests.
11. Parent/child mismatch tests.
12. Privileged RPC/function tests.

## 17. Acceptance criteria

Before V2 schema creation:

- [ ] One canonical organization tenant entity.
- [ ] Actor and membership model defined.
- [ ] Every tenant-owned entity has an explicit organization boundary.
- [ ] Authorization does not trust client organization IDs.
- [ ] RLS policy strategy exists for SELECT/INSERT/UPDATE/DELETE.
- [ ] Role/permission boundary is defined.
- [ ] Webhook tenant binding is trusted and testable.
- [ ] Jobs carry explicit tenant context.
- [ ] Storage paths are tenant-scoped.
- [ ] Ellie retrieval is tenant-scoped before model access.
- [ ] Service-role use is restricted.
- [ ] Privileged RPC/view exposure is defined.
- [ ] Cross-tenant attack matrix is executable.
- [ ] Membership revocation behavior is defined.
- [ ] Parent/child tenant consistency is enforced.
- [ ] No fail-open/default organization behavior exists.

## 18. Assumptions

- Supabase/Postgres remains the intended V2 persistence layer.
- Organizations are the SaaS tenant boundary.
- Actors may belong to multiple organizations.
- RLS is a core database enforcement layer.
- Application-layer authorization remains necessary.
- V2 will begin with a shared database rather than one database per organization.

## 19. Unknowns

- Exact JWT/session strategy for active organization context.
- Exact initial role/permission matrix.
- Exact webhook providers and trusted tenant-binding mechanism.
- Storage provider/path implementation.
- Whether any external integrations require separate service identities.
- Exact privileged RPC surface.
- Required retention and audit periods.

These should be resolved before or during implementation, not guessed into the schema.

## 20. Customer validation questions

Ask pilot organizations:
- Which staff roles can see customers, assets, and operational cases?
- Which actions require approval?
- Can one staff member work across multiple legal entities?
- Which external systems send operational/payment events?
- Who may view payment information?
- Which evidence may contain sensitive customer information?
- What actions must be auditable?
- What should happen when responsibility moves between staff members?

## 21. Minimum data required

At minimum:
- actor identity;
- organization;
- active membership;
- role/permission;
- tenant-scoped customer/site/asset identifiers;
- evidence/event source;
- correlation ID;
- actor and organization context;
- authorization outcome;
- audit record for consequential privileged operations.

## 22. Explicit schema implications

The V2 schema must provide:
- canonical `organizations`;
- actors and memberships;
- roles/permissions;
- direct `organization_id` on tenant-owned tables;
- tenant-safe parent/child relationships;
- channel identities linked to actors;
- append-oriented evidence/events;
- audit records;
- structures supporting tenant-scoped retrieval;
- no `default-org` fallback;
- no `organizations`/`organisations` dual model.

This security contract is a gate for Migration 001, not an after-the-fact hardening task.
