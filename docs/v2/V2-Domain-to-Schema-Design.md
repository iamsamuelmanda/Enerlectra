# Enerlectra V2 — Domain-to-Schema Design

**Status:** Proposed schema contract; implementation follows review  
**Date:** 2026-09-18  
**Depends on:** `docs/v2/V2-Domain-and-Tenancy-Blueprint.md`

## 1. Purpose

This document translates the V2 domain blueprint into a bounded relational design.

It is deliberately **not SQL** and does not authorize changes to the legacy Supabase project.

The schema must express:

- one shared operational kernel;
- multiple organization operating models;
- strict organization-scoped tenancy;
- Actor/Customer/Organization separation;
- evidence-driven operations;
- explicit authorization;
- traceable work and verification;
- Ellie context without allowing AI to bypass authorization.

The schema must not reproduce the legacy marketplace, cluster, PCU, staking, or settlement-centered model.

---

## 2. Schema principles

### 2.1 Organization is the tenant

Every organization-owned table has a non-null `organization_id`.

The application must not rely on indirect ownership such as:

    asset -> customer -> organization

as its only tenant boundary.

Direct organization scope exists for:

- authorization;
- RLS;
- indexing;
- query safety;
- auditing;
- operational clarity.

### 2.2 Foreign keys enforce structural ownership

Tenant-scoped child records should reference the canonical organization.

Where practical, database constraints should make it difficult or impossible to associate a child record with an organization different from its parent.

### 2.3 Identity is separate from tenancy

The model is:

    Actor
      |
    Membership
      |
    Organization

not:

    Auth user = Organization user = Customer

### 2.4 Domain semantics are stable

Business-model differences belong in operating-model configuration and capabilities.

They must not create separate customer, site, asset, event, or work tables.

### 2.5 Intelligence is derived

Recommendations and situations are derived from evidence and context.

They must not become an uncontrolled second source of truth.

### 2.6 Financial domains are bounded

Payment/financial data is introduced as a capability when a validated workflow needs it.

It does not define the operational schema.

---

# 3. Bounded schema areas

The initial V2 schema has nine bounded areas:

1. Identity & tenancy
2. Organization configuration
3. Customer & infrastructure
4. Evidence & events
5. Situations & operational work
6. Intelligence
7. Communication
8. Governance/audit
9. Optional capability-specific financial data

Only the first eight are candidates for the minimum operational foundation.

---

# 4. Identity & tenancy

## 4.1 actors

Purpose: canonical human/system identity.

Conceptual fields:

- id
- actor_type
- display_name
- email/phone or equivalent identity attributes as appropriate
- status
- created_at
- updated_at

`actor_type` should distinguish human/system where necessary. It must not encode business model or organization.

Authentication-provider identifiers may be stored separately from domain identity if required by the implementation.

## 4.2 organizations

Purpose: canonical tenant.

Conceptual fields:

- id
- name
- status
- created_at
- updated_at

Do not recreate both `organizations` and `organisations`.

There is exactly one canonical V2 tenant entity.

## 4.3 memberships

Purpose: connect an Actor to an Organization.

Conceptual fields:

- id
- organization_id
- actor_id
- role_id
- status
- created_at
- updated_at

Constraints:

- organization_id required
- actor_id required
- one active membership per actor/organization
- membership status explicitly represented

An actor may belong to multiple organizations.

## 4.4 roles

Purpose: reusable authorization role definitions.

Conceptual fields:

- id
- key
- name
- description
- scope

Initial role keys:

- OWNER
- OPERATOR
- VIEWER

Do not encode EPC/PAYGo permissions into role names.

## 4.5 permissions

Purpose: atomic authorization capabilities.

Conceptual fields:

- id
- key
- description

Examples:

- customer.read
- customer.write
- asset.read
- asset.write
- situation.read
- situation.manage
- work.assign
- work.execute
- recommendation.read
- action.authorize

The initial implementation may use a small fixed permission set rather than building a full enterprise IAM system.

## 4.6 role_permissions

Purpose: map roles to permissions.

Conceptual fields:

- role_id
- permission_id

Authorization is therefore:

    Actor
      -> Membership
      -> Role
      -> Permission

---

# 5. Channel identities

## 5.1 channel_identities

Purpose: resolve external channel identifiers to an authorized identity.

Conceptual fields:

- id
- actor_id
- channel
- external_id
- status
- metadata where necessary
- created_at
- updated_at

Constraint:

    unique(channel, external_id)

A channel identity does not itself establish organization authority.

Resolution path:

    Channel identity
       ->
    Actor
       ->
    Membership
       ->
    Organization
       ->
    Authorization

If the same external identity legitimately interacts with multiple organizations, the application must resolve the intended organization through authenticated membership/context rather than guessing.

---

# 6. Organization configuration

## 6.1 operating_model_profiles

Purpose: describe how an organization operates commercially and operationally.

Conceptual fields:

- id
- organization_id
- name
- status
- configuration/version metadata
- created_at
- updated_at

The profile is an organizational configuration object, not an authorization role.

### Model attributes

The profile may reference structured configuration for:

- business models
- customer relationship
- asset ownership
- revenue model
- payment model
- service model
- field-work model

Avoid prematurely turning every attribute into a rigid enum.

## 6.2 operating_model_business_models

Purpose: allow one organization to associate one or more business-model classifications with an operating profile.

Conceptual fields:

- operating_model_profile_id
- business_model_key
- is_primary

This supports mixed organizations.

Examples:

- EPC
- DISTRIBUTOR
- MAINTENANCE
- PAYGO
- EAAS
- MINIGRID

These are classification/configuration values, not separate domains.

## 6.3 organization_capabilities

Purpose: declare capabilities enabled for an organization.

Conceptual fields:

- id
- organization_id
- capability_key
- status
- configuration
- enabled_at
- disabled_at

Potential keys:

- CUSTOMER_MANAGEMENT
- SITE_MANAGEMENT
- ASSET_MANAGEMENT
- PROJECT_DELIVERY
- INSTALLATION
- COMMISSIONING
- WARRANTY
- MAINTENANCE
- FIELD_SERVICE
- PAYMENT_RECONCILIATION
- COLLECTIONS
- CUSTOMER_SUPPORT
- REMOTE_SERVICE
- MONITORING
- CONTRACT_MANAGEMENT
- PORTFOLIO_REPORTING

Capabilities determine available domain behavior; they do not replace actor authorization.

## 6.4 organization_policies

Purpose: explicit organization-level operational rules.

Conceptual fields:

- id
- organization_id
- policy_key
- value/configuration
- status
- effective_from
- effective_to
- created_at
- updated_at

Examples:

- fault_escalation_hours
- warranty_escalation
- payment_exception_escalation
- responsibility_assignment
- working_hours

Policy values should be validated against platform-defined schemas.

Do not create arbitrary executable code as policy.

---

# 7. Customer & infrastructure

## 7.1 customers

Purpose: organization-served customer entity.

Conceptual fields:

- id
- organization_id
- customer_type
- display_name
- contact references
- status
- external_reference
- created_at
- updated_at

Customer is not an Actor.

A customer may optionally have a linked actor identity if the product eventually requires authenticated customer interaction, but the relationship must be explicit.

## 7.2 sites

Purpose: physical/operational location.

Conceptual fields:

- id
- organization_id
- customer_id nullable where appropriate
- name/label
- address/location fields
- coordinates where justified
- status
- external_reference
- created_at
- updated_at

A site may exist before a customer relationship is finalized.

Do not make geography a mandatory dependency for every workflow.

## 7.3 assets

Purpose: physical/system asset under an organization's operational responsibility.

Conceptual fields:

- id
- organization_id
- site_id
- customer_id nullable
- asset_type_id/reference
- manufacturer_id/reference nullable
- model
- serial_number
- status
- external_reference
- installed_at
- created_at
- updated_at

Ownership and responsibility are separate concepts.

An organization may operate an asset it does not legally own.

If ownership becomes operationally important, represent it as a relationship or ownership record rather than assuming organization ownership from the tenant relationship.

## 7.4 asset relationships

Do not overload `assets` with every relationship.

Future bounded relationships may include:

- asset ownership
- asset responsibility
- asset installation
- asset connectivity
- asset component relationships

Only introduce these when pilot workflows require them.

---

# 8. Evidence & events

## 8.1 observations

Purpose: capture raw/minimally interpreted operational information.

Conceptual fields:

- id
- organization_id
- source_type
- source_reference
- observed_at
- recorded_at
- actor_id nullable
- subject references
- payload/data
- provenance
- correlation_id
- created_at

Possible source types:

- CUSTOMER_MESSAGE
- OPERATOR_REPORT
- TECHNICIAN_REPORT
- METER_READING
- TELEMETRY
- PAYMENT_NOTIFICATION
- WEBHOOK
- INTEGRATION
- SYSTEM

Observation is evidence, not automatically authoritative truth.

## 8.2 events

Purpose: normalized domain occurrence.

Conceptual fields:

- id
- organization_id
- event_type
- occurred_at
- actor_id nullable
- source
- payload
- version
- correlation_id
- causation_id
- created_at

Existing event metadata should be retained/adapted.

Events should be append-oriented and immutable from normal application paths.

Correction should occur through a new event/evidence record rather than silently rewriting historical facts.

## 8.3 event subjects

A future explicit subject-reference mechanism may be required when an event can concern different domain objects.

Possible subjects:

- customer
- site
- asset
- situation
- work item
- contract

Do not introduce a polymorphic foreign-key system without a concrete implementation need.

For the first slice, explicit nullable foreign keys or a bounded subject model may be sufficient.

---

# 9. Situations & operational work

## 9.1 situations

Purpose: persistent operational interpretation of related evidence/events.

Conceptual fields:

- id
- organization_id
- type
- status
- priority
- severity
- title/summary
- customer_id nullable
- site_id nullable
- asset_id nullable
- detected_at
- resolved_at
- resolution_summary
- created_at
- updated_at

A situation is not merely an alert.

It represents an operational problem/condition requiring understanding, action, monitoring, or closure.

## 9.2 situation_evidence

Purpose: connect situations to supporting observations/events.

Conceptual fields:

- situation_id
- observation_id nullable
- event_id nullable
- relationship_type
- created_at

This makes reasoning traceable.

## 9.3 situation_assignments

Purpose: record organizational responsibility.

Conceptual fields:

- id
- situation_id
- actor_id nullable
- role_id nullable
- assigned_at
- unassigned_at
- reason

This separates responsibility from asset ownership.

## 9.4 work_items

Purpose: track operational work.

Conceptual fields:

- id
- organization_id
- situation_id nullable
- work_type
- status
- priority
- title
- instructions
- assigned_actor_id nullable
- assigned_role_id nullable
- due_at nullable
- started_at nullable
- completed_at nullable
- created_at
- updated_at

Work must be organization-scoped and must not depend on clusters.

## 9.5 work_evidence

Purpose: connect work to evidence.

Conceptual fields:

- work_item_id
- observation_id nullable
- event_id nullable
- evidence_role
- created_at

## 9.6 actions

Purpose: record an operational action associated with work.

Conceptual fields:

- id
- organization_id
- work_item_id
- action_type
- status
- requested_by_actor_id
- authorized_by_actor_id nullable
- executed_by_actor_id nullable
- requested_at
- authorized_at nullable
- executed_at nullable
- result_summary
- created_at
- updated_at

Not every work item needs a separate action record in the first implementation.

Consequential actions should use this distinction when required.

---

# 10. Verification

## 10.1 verifications

Purpose: establish whether intended work/action produced the expected operational result.

Conceptual fields:

- id
- organization_id
- situation_id nullable
- work_item_id nullable
- action_id nullable
- verification_type
- status
- verified_by_actor_id nullable
- verified_at
- result
- created_at

Possible verification types:

- OPERATOR_CONFIRMATION
- TECHNICIAN_CONFIRMATION
- CUSTOMER_CONFIRMATION
- TELEMETRY
- METER_READING
- PAYMENT_CONFIRMATION
- SYSTEM_STATE

A verification should reference evidence where appropriate.

---

# 11. Intelligence

## 11.1 recommendations

Purpose: persist important operational recommendations when traceability requires it.

Conceptual fields:

- id
- organization_id
- situation_id
- generated_by
- status
- recommendation_type
- summary
- rationale
- confidence/uncertainty representation where useful
- context_snapshot/reference
- created_at
- expires_at nullable

Recommendation is derived data.

It must not directly mutate authoritative operational state.

## 11.2 Intelligence provenance

Every persisted recommendation should be explainable through:

    Organization context
       +
    Actor context
       +
    Operational evidence
       +
    Applied policy/capability context
       +
    Recommendation

Do not store only an opaque AI answer.

The first implementation can store a compact structured rationale and references to evidence rather than a large AI transcript.

---

# 12. Communication

## 12.1 communication_messages

Purpose: normalized inbound/outbound communication record.

Conceptual fields:

- id
- organization_id nullable where platform-level messages are legitimate
- channel
- direction
- actor_id nullable
- customer_id nullable
- external_message_id
- message_type
- content/reference
- status
- received_at/sent_at
- correlation_id
- created_at

The organization field must be resolved through an authorized context.

Inbound channel metadata must never become a tenant authorization shortcut.

---

# 13. Governance and audit

## 13.1 audit_records

Purpose: record security-sensitive and consequential operations.

Conceptual fields:

- id
- organization_id nullable for platform events
- actor_id nullable
- action
- resource_type
- resource_id
- outcome
- reason
- correlation_id
- metadata
- occurred_at

Audit records should be append-only for normal application users.

## 13.2 Evidence versus audit

These are related but distinct:

Evidence:
    what happened in the operational world.

Audit:
    what the Enerlectra platform/user did about it.

Do not collapse them into one generic table without a clear semantic contract.

---

# 14. Optional financial capability boundary

Financial entities are not part of the minimum operational kernel.

If the first PAYGo pilot requires payment exception handling, introduce only the minimum validated entities, for example:

- payment_events
- payment_references
- reconciliation_cases

Do not immediately import:

- legacy settlement tables
- treasury
- PCU
- energy wallets
- staking
- marketplace accounting

A financial ledger can be introduced later as a bounded context if the product actually requires financial accounting.

---

# 15. Core relationship map

The intended relationship is:

    Organization
      |
      +-- Operating Model
      +-- Capabilities
      +-- Policies
      +-- Memberships
      |
      +-- Customers
      |      |
      |      +-- Sites
      |             |
      |             +-- Assets
      |
      +-- Observations
      +-- Events
      +-- Situations
      |      |
      |      +-- Recommendations
      |      +-- Work Items
      |             |
      |             +-- Actions
      |                    |
      |                    +-- Verifications
      |
      +-- Communication
      +-- Audit

This is a domain relationship map, not a claim that every relationship must be a direct foreign key.

---

# 16. Tenant-scoping matrix

| Domain object | Tenant scoped? | organization_id |
|---|---:|---:|
| Actor | No | No |
| Organization | Root tenant | Self |
| Membership | Yes | Yes |
| Role | Platform reference | No |
| Permission | Platform reference | No |
| Channel identity | Actor-scoped | Not inherently |
| Operating model | Yes | Yes |
| Capability | Yes | Yes |
| Policy | Yes | Yes |
| Customer | Yes | Yes |
| Site | Yes | Yes |
| Asset | Yes | Yes |
| Observation | Yes | Yes |
| Event | Yes | Yes |
| Situation | Yes | Yes |
| Recommendation | Yes | Yes |
| Work item | Yes | Yes |
| Action | Yes | Yes |
| Verification | Yes | Yes |
| Communication message | Usually | Yes where organization-owned |
| Audit record | Yes or platform-scoped | Nullable |

The default for operational data is tenant-scoped.

---

# 17. RLS design contract

For every tenant-scoped table:

1. RLS enabled.
2. Organization membership required for SELECT.
3. Organization membership required for INSERT.
4. Organization membership required for UPDATE.
5. Organization membership required for DELETE.
6. INSERT/UPDATE cannot change organization_id to an unauthorized organization.
7. Membership status must be checked.
8. Role/permission checks apply to protected operations.
9. Missing organization context fails closed.

The exact RLS helper functions and SQL are deferred to implementation.

---

# 18. Cross-tenant invariants

The following must hold:

### I-001

A user authenticated only in Organization A cannot retrieve Organization B operational records.

### I-002

A user cannot insert an Organization B record while authenticated only in Organization A.

### I-003

A user cannot update an existing Organization B record.

### I-004

A user with memberships in A and B must not receive combined unscoped data merely because they belong to both.

The active/selected organization context must be explicit where the UI or API requires it.

### I-005

A revoked membership immediately removes organization access.

### I-006

AI retrieval must inherit tenant scope.

### I-007

Background jobs must carry explicit organization context.

### I-008

Webhook processing must derive tenant context from trusted integration configuration, not a user-controlled header.

### I-009

Storage objects containing organization data must be tenant-scoped.

### I-010

Analytics must not expose raw tenant data across organizations.

---

# 19. Indexing direction

Initial indexes should prioritize:

- organization_id
- organization_id + status
- organization_id + created_at
- organization_id + relevant operational state
- membership actor_id + organization_id
- channel + external_id
- external references where operationally required

Do not optimize the legacy schema.

Do not add indexes merely because a table exists. Indexes should follow actual query paths from the vertical slice.

---

# 20. Uniqueness and integrity direction

Potential constraints:

- unique organization name only if product policy requires global uniqueness;
- unique membership per actor/organization;
- unique channel/external identity;
- serial uniqueness should be scoped according to actual operational requirements;
- external references should be scoped to organization where they originate from customer systems.

Avoid global uniqueness assumptions that break multi-tenancy.

---

# 21. Lifecycle semantics

Use explicit status transitions rather than destructive deletion where historical operational evidence matters.

Examples:

Situation:

    OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED
                                      -> REOPENED

Work:

    OPEN -> ASSIGNED -> IN_PROGRESS -> COMPLETED
                               -> BLOCKED
                               -> CANCELLED

Recommendation:

    PROPOSED -> ACCEPTED
             -> DISMISSED
             -> EXPIRED

Action:

    REQUESTED -> AUTHORIZED -> EXECUTING -> SUCCEEDED
                                      -> FAILED
              -> REJECTED

Verification:

    PENDING -> VERIFIED
            -> FAILED
            -> INCONCLUSIVE

Exact states remain subject to pilot validation.

---

# 22. Idempotency and event integrity

The event/communication boundary must support duplicate delivery safely.

External messages and webhooks should carry stable external identifiers where available.

Potential uniqueness:

    organization_id + source + external_event_id

must be evaluated per integration.

Commands/actions with consequential side effects should support idempotency keys.

The same external event must not create duplicate operational work merely because a webhook was retried.

---

# 23. Ellie data-access contract

Ellie should receive a context object conceptually equivalent to:

    actor
    organization
    membership
    role
    permissions
    operating_model
    capabilities
    policies
    current operational context
    relevant evidence
    relevant events
    relevant situations
    relevant work

The retrieval layer must apply tenant scope before returning data to Ellie.

Do not give Ellie unrestricted database access.

Do not allow an AI prompt to contain raw records from another tenant.

---

# 24. Storage and files

If V2 stores documents, photos, technician reports, invoices, or other files, the storage path should encode tenant scope.

Conceptual:

    organization/{organization_id}/...

Access must be authorized by membership and resource relationship.

A guessed storage path must not grant access.

---

# 25. Schema decisions intentionally rejected

### Rejected: separate tenant databases per organization

Not required for initial V2.

### Rejected: EPC/PAYGo-specific core tables

Would duplicate semantics and fragment the platform.

### Rejected: business_model as authorization

Commercial classification does not establish actor authority.

### Rejected: customer as actor

Many customers will not be application users.

### Rejected: cluster as operational root

Legacy-specific and incompatible with the new operational model.

### Rejected: settlement ledger as universal source of truth

Financial accounting is a bounded domain, not the source of every operational state.

### Rejected: unrestricted no-code workflow engine

Premature and likely to become a separate product.

### Rejected: telemetry as mandatory infrastructure

The platform must work with human reports, integrations, payments, and other evidence sources.

---

# 26. Minimum V2 schema

The smallest credible operational foundation is:

    actors
    organizations
    memberships
    roles
    permissions
    role_permissions
    channel_identities

    operating_model_profiles
    organization_capabilities
    organization_policies

    customers
    sites
    assets

    observations
    events

    situations
    situation_evidence
    work_items
    recommendations
    verifications

    communication_messages
    audit_records

This is a target design, not a requirement that every table be created in the first migration.

For the first vertical slice, the actual physical schema may be smaller.

---

# 27. First migration sequence

Do not build one giant migration.

Recommended sequence:

### Migration 001 — Foundation

- organizations
- actors
- memberships
- roles
- permissions
- role_permissions

### Migration 002 — Organization configuration

- operating_model_profiles
- business-model classifications
- organization_capabilities
- organization_policies

### Migration 003 — Customer infrastructure

- customers
- sites
- assets

### Migration 004 — Evidence

- observations
- events

### Migration 005 — Operational work

- situations
- situation_evidence
- work_items
- verifications

### Migration 006 — Intelligence and communication

- recommendations
- communication_messages
- audit_records

Financial capability migrations come only when required.

Each migration must be reproducible from a clean V2 database.

---

# 28. First vertical-slice physical subset

Before creating all target tables, the minimum pilot subset should likely be:

    organizations
    actors
    memberships
    roles
    permissions
    role_permissions
    channel_identities

    customers
    sites
    assets

    observations
    events
    situations
    situation_evidence
    work_items
    recommendations
    verifications

    communication_messages
    audit_records

Operating-model/capability configuration must be present enough for Ellie and workflow selection, but its physical representation can remain deliberately small until the pilot confirms the needed dimensions.

---

# 29. EPC/PAYGo architectural test

The same physical core must support:

### Tenant A — EPC

Enabled:

- customer management
- site management
- asset management
- installation
- commissioning
- warranty
- maintenance

### Tenant B — PAYGo

Enabled:

- customer management
- site management
- asset management
- payment reconciliation
- collections
- customer support
- maintenance

Both use:

    customers
    sites
    assets
    observations
    events
    situations
    recommendations
    work_items
    verifications

No duplicated EPC/PAYGo domain schema is permitted.

---

# 30. Legacy mapping

Legacy concepts are not schema requirements.

| V1 concept | V2 treatment |
|---|---|
| users | Re-evaluate as authentication/infrastructure; canonical domain identity becomes Actor |
| profiles | Re-evaluate; do not duplicate identity semantics |
| organizations | Replace with one canonical organizations entity |
| organisations | Retire/consolidate |
| customers | Adapt into tenant-scoped customers |
| assets | Rebuild around Site/Asset semantics |
| energy_readings | Treat as possible observation source |
| meter_readings | Treat as possible observation source |
| events | Rebuild/align around V2 event contract |
| alerts | Do not equate with Situation |
| work_orders | Rebuild as Work Items; remove cluster dependency |
| tickets/support_tickets | Consolidate according to operational workflow |
| communication_messages | Reuse/adapt |
| energy_wallets | Legacy/abandon |
| energy_listings | Legacy/abandon |
| energy_requests | Legacy/abandon |
| energy_trades | Legacy/abandon |
| settlements | Separate financial context |
| treasury_* | Separate financial context |
| PCU_* | Legacy/abandon |
| clusters | Legacy/abandon |
| cluster_members | Legacy/abandon |
| ownership_snapshots | Legacy/abandon unless a validated future capability requires a bounded equivalent |
| staking | Legacy/abandon |
| blockchain trading | Legacy/abandon |

---

# 31. Open schema decisions

These remain intentionally unresolved:

1. Exact Actor fields and authentication-provider relationship.
2. Whether operating_model_profiles is one current profile per organization or versioned profiles.
3. Exact business-model classification storage.
4. Whether capability configuration requires JSON configuration initially.
5. Exact policy schema/validation mechanism.
6. Customer/site cardinality rules.
7. Whether one asset can have multiple operational sites over time.
8. Asset ownership/responsibility relationship design.
9. Event subject modeling.
10. Situation deduplication/correlation rules.
11. Recommendation persistence threshold.
12. Work/action granularity.
13. Verification evidence model.
14. Communication tenant resolution for multi-organization actors.
15. Financial exception model for PAYGo.
16. Storage object model.
17. Audit retention requirements.
18. Exact RLS helper functions.
19. Exact permission set.

These should be resolved immediately before their implementation requires them, using pilot evidence where possible.

---

# 32. Schema acceptance criteria

The schema is ready for implementation only when:

- every tenant-scoped entity has an explicit organization boundary;
- Actor, Customer, and Organization remain distinct;
- multi-organization actors are supported;
- EPC and PAYGo can use the same core entities;
- capabilities are configurable without duplicating domains;
- policies are explicit and bounded;
- events/evidence are traceable;
- situations can aggregate evidence;
- recommendations remain non-authoritative;
- work can be assigned and tracked;
- consequential actions can be authorized;
- verification can establish resolution;
- Ellie cannot bypass tenant or role authorization;
- the V1 marketplace/cluster/PCU model is not required;
- the schema can be created from an empty database reproducibly.

---

# 33. Next implementation gate

Do **not** create the V2 Supabase project from this document yet.

First review:

1. V2 Domain & Tenancy Blueprint
2. V2 Domain-to-Schema Design
3. First EPC workflow
4. First PAYGo workflow
5. RLS/tenant attack model

Then freeze the first schema subset.

Only after approval:

    New Supabase project
        ->
    migration 001
        ->
    RLS foundation
        ->
    seed/reference roles
        ->
    tenant-isolation tests
        ->
    customer/site/asset slice
        ->
    evidence/event slice
        ->
    situation/work slice
        ->
    Ellie integration
        ->
    EPC/PAYGo pilot

The V2 database must never be created merely because the schema document exists.
