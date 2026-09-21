# Enerlectra V2 — Operating Profile, Capability & Responsibility Scope Design

**Status:** Architecture design gate — before Migration 019  
**Date:** 2026-09-21  
**Scope:** Lusaka-first distributed-energy operating model

## 1. Purpose

Define the minimum persisted representation needed to express how an organization operates, what Enerlectra capabilities are enabled for it, and how operational responsibility is bounded.

This document deliberately precedes Migration 019. It does not authorize schema implementation by itself.

The design must preserve one operational kernel across materially different organizations.

## 2. Core separation

Enerlectra must keep these concepts distinct:

- **Operating Profile:** how an organization operates.
- **Capability:** a platform-supported operational capability enabled for an organization.
- **Role:** a reusable permission bundle.
- **Permission:** machine-enforceable authorization.
- **Responsibility:** accountability for a class of operational work.
- **Scope:** the bounded population/domain over which that responsibility applies.
- **Action Authorization:** a specific approval for a consequential Action.

Therefore:

```
Organization
    |
    +-- Operating Profile
    |     +-- activities
    |     +-- customer segments
    |     +-- ownership models
    |     +-- service responsibilities
    |     +-- payment models
    |
    +-- Enabled Capabilities
    |
    +-- Policies
    |
    +-- Memberships
          +-- Role -> Permissions
          +-- Responsibility assignments
```

Responsibility does **not** grant permissions by itself. Permissions remain the authorization primitive.

## 3. Operating Profile

### 3.1 Minimum persisted model

Start with one current operating profile per organization.

Conceptual entity:

```
operating_model_profiles
- id
- organization_id
- status
- version
- name
- effective_from
- effective_to nullable
- metadata
- created_at
- updated_at
```

A profile is a bounded configuration record, not a business-model enum.

### 3.2 Multi-valued dimensions

Do not place the semantic dimensions into one large JSON document.

The profile should support multiple values for:

- business activities;
- customer segments;
- asset/ownership models;
- service responsibilities;
- payment models.

Conceptually:

```
operating_model_profile_activities
operating_model_profile_customer_segments
operating_model_profile_ownership_models
operating_model_profile_service_responsibilities
operating_model_profile_payment_models
```

Each association is tenant-scoped through the organization/profile relationship and uses controlled keys.

This permits an organization to combine activities and models rather than forcing a single archetype.

### 3.3 Controlled vocabulary

Initial controlled values come from the approved market operating-model specification.

Business activities:
- INSTALLATION
- DISTRIBUTION
- MAINTENANCE
- FINANCING
- ENERGY_GENERATION
- ENERGY_SERVICE
- CUSTOMER_SUPPORT

Customer segments:
- RESIDENTIAL
- SME
- COMMERCIAL
- INDUSTRIAL
- INSTITUTIONAL
- PUBLIC_SECTOR
- OTHER

Ownership models:
- CUSTOMER_OWNED
- ORGANIZATION_OWNED
- FINANCED
- THIRD_PARTY_OWNED

Service responsibilities:
- INSTALLATION
- WARRANTY
- O_AND_M
- CUSTOMER_SUPPORT
- REMOTE_MONITORING
- FIELD_SERVICE

Payment models:
- CASH
- RECURRING
- PAYGO
- CONTRACT
- MIXED

These values describe organizational context. They do not automatically create authorization.

## 4. Organization capabilities

Capabilities answer:

> What operational functions does this organization use/support through Enerlectra?

Conceptual entity:

```
organization_capabilities
- id
- organization_id
- capability_key
- status
- configuration
- enabled_at
- disabled_at nullable
- created_at
- updated_at
```

Initial capability vocabulary:

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

Capabilities are organization-level configuration.

They do not grant an actor permission to execute an operation.

A capability can be enabled while only particular members have the relevant permissions.

## 5. Capability/profile consistency

The operating profile provides context; capability activation represents what the organization actually enables in Enerlectra.

Do not create a rigid automatic rule such as:

```
MAINTENANCE activity => MAINTENANCE capability
```

Instead, validate obvious contradictions at the application/domain boundary where useful.

An organization may perform an activity outside the initial Enerlectra capability set, and an enabled capability may support a broader activity.

This prevents the configuration layer from becoming an inflexible business-rule engine.

## 6. Responsibility model

The central abstraction is:

```
WHO
 ↓
is responsible for
 ↓
WHAT
 ↓
within WHICH BOUNDED SCOPE?
```

Responsibility is not equivalent to job title, role, ownership, or permission.

### 6.1 Minimum responsibility assignment

Do not create the proposed polymorphic fields:

- serviceTerritoryId
- customerPortfolioIds
- sitePortfolioIds
- activityTypes

inside one row.

That design would create nullable foreign-key ambiguity and make scope semantics difficult to enforce.

Instead, responsibility should be modeled as a bounded assignment:

```
responsibility_assignments
- id
- organization_id
- actor_id
- responsibility_key
- scope_id
- status
- effective_from
- effective_to nullable
- created_at
- updated_at
```

The assignment says **who is accountable for what scope**.

It does not contain permissions.

### 6.2 Responsibility vocabulary

Start with operational responsibilities rather than job titles.

Examples:

- MAINTENANCE
- CUSTOMER_SUPPORT
- PAYMENT_RECONCILIATION
- COLLECTIONS
- EQUIPMENT_INSPECTION
- WARRANTY
- SITE_OPERATIONS
- ASSET_MANAGEMENT
- FIELD_SERVICE

This vocabulary must remain bounded and should only expand when a real workflow requires a new responsibility.

## 7. Responsibility scope

The critical design decision is that scope must be an actual bounded domain, not merely a string or arbitrary collection of IDs.

Do not introduce a universal polymorphic `scope_type + scope_id` pointing at arbitrary tables.

Before persistence, validate which scope types the first real Lusaka workflow requires.

Candidate scope forms:

- ORGANIZATION
- CUSTOMER_PORTFOLIO
- SITE_PORTFOLIO
- ASSET_PORTFOLIO
- SERVICE_TERRITORY
- WORK_TYPE

However, these are **candidate forms**, not an instruction to create all six.

### 7.1 First-pilot rule

The first persisted scope model should contain only scope types demonstrated by the first Lusaka pilot.

For example, if the pilot proves only:

```
Actor -> Maintenance -> selected sites
```

then persist site responsibility using an explicit site-assignment relationship rather than building territory, portfolio, work-type, and financial scope infrastructure.

If the pilot proves:

```
Actor -> Maintenance -> Lusaka South territory
```

then a bounded service-territory concept can be introduced.

This keeps scope scalable without prematurely building a generic access-control engine.

## 8. Responsibility and permissions

The proposed design must **not** put a permissions array inside each responsibility scope.

Correct separation:

```
Role
  ↓
Permissions

Responsibility Assignment
  ↓
Accountability Scope

Organization Capability
  ↓
Supported Operational Function
```

An operation is permitted only when the authorization model says so, and operational assignment determines whether the actor is responsible for the relevant work.

Conceptually:

```
Can actor perform operation?
    -> permission

Is actor accountable for this operational object/work?
    -> responsibility scope

Does organization support the capability?
    -> organization capability

Is this consequential action authorized?
    -> Action authorization
```

These checks should not be collapsed.

## 9. Membership / role relationship

Do not modify `memberships` yet.

Current roles remain temporarily valid.

Before changing from one `membership.role` to multiple role assignments, validate whether the first pilot actually requires multiple simultaneous permission bundles.

The responsibility model can be introduced without immediately replacing the existing role foundation.

This avoids Migration 019 becoming a catch-all authorization rewrite.

## 10. Versioning

Start with one current operating profile per organization, while retaining:

- profile version;
- effective dates;
- status.

Do not build full historical version management until there is a real need to reconstruct prior operating configurations.

Historical operational evidence must remain independently traceable even if organizational configuration changes.

## 11. Tenant isolation

All persisted operating-profile and responsibility configuration is organization-scoped.

Required invariants:

1. Every organization-owned configuration row has non-null `organization_id`.
2. Cross-organization profile associations are rejected.
3. An actor may only create/read/update responsibility assignments within an organization where they have the required permission.
4. `actor_id` must belong to an active membership in the same organization.
5. A responsibility assignment cannot become an implicit cross-tenant authorization path.
6. RLS remains forced and permission-gated.
7. Background jobs and AI retrieval carry explicit organization context.

## 12. What this design intentionally does not build

Do not build yet:

- Migration 019;
- multiple role assignment architecture;
- generic RBAC/ABAC engine;
- generic workflow engine;
- generic portfolio engine;
- generic geographic territory engine;
- polymorphic resource authorization;
- payment ledger;
- telemetry platform;
- autonomous authorization;
- EPC/PAYGo-specific schema.

## 13. Migration gate

Migration 019 should only be created after a real pilot workflow answers:

1. Which operating-profile dimensions must be persisted?
2. Which capabilities must be enabled?
3. What responsibility must be assigned?
4. What concrete scope does that responsibility cover?
5. Which existing permission controls the operation?
6. Does the current membership/role model express the required authority?
7. What cross-tenant and revocation tests are required?

The migration should implement only those proven requirements.

## 14. Required validation scenarios

Before implementation, test the design conceptually against:

### Scenario A
Technician accountable for maintenance across a defined set of sites.

### Scenario B
Finance actor accountable for payment reconciliation across a defined customer set.

### Scenario C
Operations actor accountable for asset/service operations across a portfolio.

### Scenario D
Support actor accountable for warranty cases.

### Scenario E
Actor with more than one responsibility scope in the same organization.

For each scenario verify:

- operating profile context;
- capability activation;
- responsibility assignment;
- permission check;
- tenant boundary;
- membership revocation;
- reassignment;
- effective dates.

## 15. Decision

The minimum durable abstraction is:

```
Organization
    |
    +-- Operating Profile
    |     +-- Activities
    |     +-- Customer Segments
    |     +-- Ownership Models
    |     +-- Service Responsibilities
    |     +-- Payment Models
    |
    +-- Capabilities
    |
    +-- Membership
          |
          +-- Existing Role -> Permissions
          |
          +-- Responsibility Assignment
                    |
                    +-- Responsibility
                    +-- Bounded Scope
```

This is the architecture gate immediately before physical schema implementation.

**Decision:** do not create Migration 019 until the first Lusaka workflow identifies the minimum concrete responsibility scope.

**Decision:** responsibility does not contain permissions.

**Decision:** do not use polymorphic scope identifiers.

**Decision:** do not replace current roles yet.

**Decision:** operating profile is multidimensional and organization-scoped.

**Decision:** capability activation is distinct from both role and responsibility.

**Decision:** Work Item migrations 009–014 and Action migrations 015–018 remain frozen.
