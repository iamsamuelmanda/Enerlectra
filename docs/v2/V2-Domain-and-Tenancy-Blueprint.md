# Enerlectra V2 — Domain & Tenancy Blueprint

Status: Architecture contract for V2 planning
Date: 2026-09-18
Scope: Domain, tenancy, organization operating models, capabilities, authorization, operational intelligence, and pilot boundaries
Database status: No V2 database or migration is defined by this document
Legacy status: Enerlectra V1 remains frozen legacy/reference infrastructure

## 1. Executive architecture statement

Enerlectra V2 is a multi-tenant operational-intelligence platform for distributed-energy businesses.

Core principle:

> One operational kernel. Multiple organizational operating models. Strict tenant isolation. Configurable capabilities.

Four non-negotiable boundaries:

1. Tenant boundary — Organization is the security and operational boundary.
2. Identity boundary — Actor, Customer, and Organization are distinct.
3. Domain boundary — the V2 operational core is separate from financial settlement and legacy energy trading.
4. Configuration boundary — organization-specific behavior is configured through operating models, capabilities, policies, responsibilities, terminology, and escalation rules rather than duplicated domain schemas.

## 2. Platform boundary

Enerlectra provides the stable platform primitives:

- Identity and authentication integration
- Multi-tenancy
- Membership and authorization
- Event and command infrastructure
- Workflow primitives
- Operational intelligence
- Communication adapters
- Audit and evidence
- Shared reference data
- Observability and platform health

The platform must not encode EPC, PAYGo, mini-grid, maintenance, or other business models as separate products.

Deferred/legacy concerns include:

- Energy marketplace economics
- PCU
- Energy wallets
- P2P energy trading
- Cluster ownership economics
- Staking
- Blockchain settlement
- Universal financial ledger
- Generic no-code workflow authoring

## 3. Tenant boundary

An Organization is a tenant.

Conceptually:

    Enerlectra Platform
        |
        +-- Organization A
        |      +-- Customers
        |      +-- Sites
        |      +-- Assets
        |      +-- Events
        |      +-- Situations
        |      +-- Work
        |
        +-- Organization B
        |      +-- Customers
        |      +-- Sites
        |      +-- Assets
        |      +-- Events
        |      +-- Situations
        |      +-- Work
        |
        +-- Organization C
               +-- Customers
               +-- Sites
               +-- Assets
               +-- Events
               +-- Situations
               +-- Work

Tenant invariant:

> No authenticated actor may access organization-scoped data unless an active membership grants that actor access to the resource's organization_id.

If organization context cannot be established and authorized, the operation must fail. The system must never infer an organization from an arbitrary client-supplied identifier, phone number, webhook header, or stale session context.

## 4. Identity model

### Actor

An Actor is a canonical human or system identity capable of performing or initiating actions.

Actor is not Customer.
Actor is not Organization.

An actor may have memberships in multiple organizations.

    Actor
      |
      +-- Membership --> Organization A
      |
      +-- Membership --> Organization B

### Customer

A Customer is an entity served by an Organization. A customer does not need an Enerlectra login.

A customer may communicate through a channel, but that does not automatically make the customer an Actor.

### Organization

An Organization is a tenant/business using Enerlectra.

### Membership

A Membership connects an Actor to an Organization and establishes organizational context.

Minimum conceptual attributes:

- actor
- organization
- role
- status
- effective dates where required

### Channel identity

A ChannelIdentity connects an external channel identity to an Actor or explicitly authorized business identity.

Examples:

- WhatsApp number
- Telegram identity
- Web/API identity

Channel identifiers are adapters/identifiers, not authorization boundaries.

## 5. Authorization model

Authorization has two dimensions.

Tenant scope:

    Actor -> active Membership -> Organization

Permission scope:

    Actor -> Role -> Permission/Capability -> Operation

Therefore an operation must consider:

- Is the actor authorized?
- Is the actor authorized in this organization?
- Does the target resource belong to this organization?
- Is the capability enabled?
- Does organization policy permit the operation?

Initial roles:

- OWNER
- OPERATOR
- VIEWER

Add TECHNICIAN, FINANCE, SUPPORT, or other roles only when pilot evidence requires them.

## 6. Organization operating model

Business model is configuration/context, not tenant identity.

An organization may combine multiple commercial and service models.

Example:

    Solar installer
       +
    equipment distributor
       +
    maintenance provider
       +
    financing partnership

Do not make a single field such as organization.type = PAYGO the master switch for the platform.

An operating-model profile describes relevant characteristics:

- primary business model
- secondary business models
- customer relationship model
- asset ownership model
- revenue model
- payment model
- service model
- field-work model
- enabled capabilities
- organization policies

These characteristics influence workflows, terminology, priorities, recommendations, and authorization without changing the core operational primitives.

## 7. Initial business-model archetypes

Archetypes are reference configurations, not separate domains:

- EPC / solar installer
- PAYGo asset-finance operator
- Energy-as-a-Service provider
- Mini-grid operator
- C&I portfolio operator
- Distributor
- Maintenance provider
- Energy trader

They are not exhaustive and must not become a permanent rigid enumeration that prevents mixed models.

### EPC example

Possible capabilities:

- project delivery
- customer management
- site management
- asset management
- procurement
- installation scheduling
- commissioning
- warranty
- maintenance

### PAYGo example

Possible capabilities:

- customer management
- site management
- asset management
- customer finance
- payment reconciliation
- collections
- customer support
- service/device status
- remote activation
- maintenance

The common operational kernel remains the same.

## 8. Capability model

A capability answers:

> What can this organization actually do through Enerlectra?

Potential capabilities:

- CUSTOMER_MANAGEMENT
- SITE_MANAGEMENT
- ASSET_MANAGEMENT
- PROJECT_DELIVERY
- PROCUREMENT
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

Do not implement all of these immediately.

Capability invariant:

> The presence of a business-model label must never grant an actor permission to perform an operation.

Business model influences available workflows. Authorization determines what a specific actor can do.

## 9. Organization policies

Policies govern organization-specific operating behavior.

Examples:

- escalation after a defined period
- who may approve a consequential action
- who receives an incident
- warranty handling rules
- collection escalation rules
- service-level expectations
- terminology
- working hours
- responsibility assignment

Do not encode tenant-specific behavior as scattered code such as company-specific conditionals.

## 10. Core operational domain

The stable operational kernel is:

    Customer
       |
      Site
       |
      Asset
       |
    Observation / Evidence
       |
      Event
       |
    Situation
       |
   Recommendation
       |
   Authorization
       |
    Work Item
       |
      Action
       |
   Verification

Not every workflow must contain every step, but the semantics remain stable.

### Customer

The entity served by an organization.

### Site

A physical or operational location associated with service delivery, assets, customers, or work.

Site is a first-class V2 concept.

### Asset

A physical/system asset relevant to operations.

An asset should eventually support relationships such as organization, site, customer relationship where applicable, type, manufacturer/model, serial number, installation, connectivity, operational state, and maintenance history.

Do not recreate the legacy thin asset table by adding dozens of unrelated columns.

## 11. Observation and evidence

An Observation is raw or minimally interpreted information.

Sources may include:

- customer message
- operator report
- technician report
- meter reading
- telemetry
- payment notification
- webhook
- integration
- system-generated observation

Observation is evidence, not automatically truth.

Evidence should retain provenance sufficient to answer:

- what was observed
- by whom or what
- when
- through which source
- for which organization
- concerning which subject
- with what correlation/context

## 12. Event model

An Event is a normalized record that something occurred.

Existing infrastructure already contains useful metadata:

- eventId
- timestamp
- actorId
- organizationId
- correlationId
- causationId
- version

These concepts should be retained/adapted.

Events must remain organization-scoped.

Example:

    PAYMENT_FAILED

For an EPC it may represent an unpaid project milestone.
For PAYGo it may represent a customer installment failure.
For EaaS it may represent a recurring service-payment failure.

The event remains stable while the applicable playbook differs.

## 13. Situation / Incident

Alert, incident, and situation are not interchangeable.

Alert:
Something worth notifying someone about.

Incident:
An operational problem requiring resolution.

Situation:
Enerlectra's current interpretation of related evidence and events.

A situation may contain:

- current status
- severity/priority
- affected organization
- affected customer/site/asset
- evidence references
- related events
- current interpretation
- assigned responsibility
- recommendations
- linked work
- resolution state

Do not force a large incident-management platform into V2 before the workflow requires it.

## 14. Recommendation

A Recommendation is a proposed next step derived from evidence and operational context.

It is not automatically an action.

Example:

    Situation:
    Customer reports no power.

    Evidence:
    Asset last reported healthy.
    Similar issue detected at one neighboring site.
    Recent maintenance event exists.

    Recommendation:
    Inspect the site-side protection equipment before replacing
    the inverter.

Recommendations should preserve enough context to explain why they were produced.

## 15. Authorization

Consequential actions require authorization appropriate to the actor and organization.

Distinguish:

    recommendation
        !=
    authorized intent
        !=
    executed action

AI output does not grant authority.

## 16. Work Item

Work is the operational execution primitive.

A V2 Work Item must not depend on clusters.

Work may originate from:

- asset fault
- customer issue
- payment exception
- maintenance requirement
- site problem
- installation task
- operational exception
- recommendation

Potential attributes:

- organization
- situation
- subject
- assignee/responsible role
- status
- priority
- due/target time
- work type
- instructions
- evidence
- timestamps

## 17. Action

An Action is an operation performed as part of resolving work or changing operational state.

Examples:

- assign technician
- schedule inspection
- update asset state
- contact customer
- record maintenance
- reconcile a payment exception
- confirm installation completion

Actions must carry organization and actor/authorization context.

Where appropriate, actions produce new evidence/events.

## 18. Verification

Verification closes the loop.

The system should answer:

> Did the intended action actually resolve the situation?

Verification may be:

- operator confirmation
- technician report
- customer confirmation
- telemetry
- meter reading
- payment confirmation
- system state change
- another trusted observation

A resolution without evidence must be distinguishable from a verified resolution.

## 19. Operational intelligence loop

Canonical loop:

    OBSERVE
       |
    UNDERSTAND
       |
    DETECT PROBLEM
       |
    RECOMMEND
       |
    AUTHORIZE
       |
    ACT
       |
    VERIFY
       |
    LEARN

More explicit workflow:

    EVENT
      |
    DETECT
      |
    UNDERSTAND
      |
    PRIORITIZE
      |
    ASSIGN
      |
    ACT
      |
    VERIFY
      |
    LEARN

## 20. Ellie context model

Ellie is an operator-facing intelligence layer.

Ellie must resolve context before reasoning over organization data.

    Actor
      |
    Membership
      |
    Organization
      |
    Role / permissions
      |
    Operating model
      |
    Enabled capabilities
      |
    Organization policies
      |
    Operational context
      |
    Evidence / Events / Situations
      |
    Recommendation

Ellie must never retrieve or reason over another tenant's operational data.

Ellie inherits the authorized organization context and permissions of the requesting actor unless a separately authenticated system workflow explicitly grants another scope.

AI recommendations do not grant authority.

## 21. Communication adapters

Channels are adapters, not the product definition.

Initial channels may include:

- Web
- WhatsApp
- API
- Telegram where required later

Example:

    WhatsApp message
       |
    Channel adapter
       |
    Channel identity resolution
       |
    Actor/customer resolution
       |
    Organization authorization
       |
    Domain operation

A message must never be routed by simply trusting an organization_id supplied by a channel/client.

## 22. Data ownership and classification

### Platform-owned

- platform configuration
- system health
- deployment metadata
- shared application configuration

### Organization-owned

- customers
- sites
- assets
- contracts
- observations
- events
- situations
- recommendations
- work
- operational evidence
- organization configuration
- organization policies

### Actor-owned

- personal identity attributes
- channel identities
- actor preferences

### Shared/reference

- equipment manufacturers
- equipment types
- currencies
- countries
- standard classifications

### Cross-organization analytics

Aggregated or anonymized analytics may be possible, but must be explicitly designed.

> Raw operational data from Organization A must never become operational intelligence available to Organization B.

## 23. Multi-tenant RLS invariants

The V2 database must enforce tenant isolation at the database layer.

For every tenant-scoped resource:

- organization_id is required
- it references canonical organizations
- it is indexed
- RLS is enabled
- policies are explicit
- reads are membership-scoped
- inserts are membership-scoped
- updates are membership-scoped
- deletes are membership-scoped

Write policies must prevent a member of Organization A from creating or changing a record to Organization B's organization_id.

The exact SQL is deferred until the domain model is approved.

### Service-role rule

Supabase service-role credentials must never be exposed to clients.

Server-side elevated operations must be narrowly scoped, auditable, and responsible for establishing correct organization context.

### Database security rule

Security-definer functions, views, RPCs, storage policies, and background jobs are part of the tenant boundary. RLS alone is not sufficient if another execution path bypasses it.

## 24. Cross-tenant attack/test matrix

Before V2 production readiness:

| Test | Expected result |
|---|---|
| Org A user reads Org A customer | Allowed |
| Org A user reads Org B customer | Denied / no rows |
| Org A user reads Org B asset | Denied / no rows |
| Org A user updates Org B work | Denied |
| Org A user deletes Org B work | Denied |
| Org A user inserts record with Org B organization_id | Denied |
| User removed from Org A | Access immediately revoked |
| User belongs to A and B | Access scoped to authorized org context |
| Technician accesses role-restricted operation | Denied |
| Finance role changes protected asset state | Denied |
| Unauthenticated request queries tenant data | Denied |
| Forged organization ID in API body | Denied |
| Forged organization ID in webhook header | Denied |
| WhatsApp identity associated with wrong tenant | Denied |
| Ellie requests data outside actor scope | Denied |
| Ellie attempts unauthorized action | Denied |
| Cross-tenant file/storage access | Denied |
| Cross-tenant analytics retrieval | Denied |
| Background job missing tenant context | Fails closed |
| Elevated operation without validated tenant scope | Denied by application guard/audit control |

## 25. V1 to V2 dependency map

### KEEP / ADAPT

- TypeScript
- React
- Express
- Supabase as a platform
- authentication infrastructure where suitable
- logging
- metrics/observability
- CI/deployment
- WhatsApp adapter
- event metadata
- correlation IDs
- causation IDs
- command contracts
- event bus
- workflow primitives
- execution context
- organization context concepts
- customer concepts
- asset concepts
- communication message concepts
- Ellie operator direction

### REBUILD

- organization/tenant model
- actor/membership/role model
- authorization
- sites
- operational situations/incidents
- work model
- verification model
- organization operating-model configuration
- capability configuration

### ISOLATE

- legacy financial settlement
- treasury
- legacy simulations
- Telegram if not required for the first pilot
- historical financial capabilities

### ABANDON FROM V2 CORE

- PCU
- energy wallets
- energy listings
- energy requests
- P2P trading
- matching engine
- clusters
- cluster governance
- ownership shares
- staking
- blockchain energy trading
- cluster-specific work model
- legacy cluster frontend

## 26. Legacy database treatment

The existing enerlectra-prod Supabase project is historical infrastructure.

It must not be converted into V2 by incremental renames and additions.

Known issues include:

- organizations and organisations coexist
- identity is fragmented
- no clean membership model
- work orders are cluster-shaped
- tickets/support tickets are duplicated
- event storage semantics drift between code and database
- repository migration history does not match live migration state
- legacy financial/trading/cluster functions remain
- RLS/security posture requires redesign

The current database should be:

1. Snapshotted.
2. Verified for actual data.
3. Mapped for active dependencies.
4. Frozen from further architectural growth.
5. Retained as legacy/reference until deliberately retired.

No V2 application should depend on the old schema merely because it already exists.

## 27. First EPC pilot

The first EPC workflow should prove the common kernel against a project/installation-oriented organization.

    Customer reports system problem
       |
    Resolve actor/customer
       |
    Resolve Organization
       |
    Resolve Site
       |
    Resolve Asset
       |
    Gather evidence
       |
    Create/update Situation
       |
    Ellie summarizes likely cause
       |
    Recommendation
       |
    Authorized operator assigns Work
       |
    Technician performs Action
       |
    Evidence recorded
       |
    Verification
       |
    Situation resolved or reopened

EPC context may include:

- installation status
- commissioning status
- warranty status
- responsible technician
- project milestone
- maintenance responsibility

No EPC-specific customer or asset table is required.

## 28. First PAYGo pilot

The second workflow must prove that the same kernel supports a materially different organization.

    Customer payment notification/problem
       |
    Resolve actor/customer
       |
    Resolve Organization
       |
    Resolve customer service context
       |
    Gather payment + service evidence
       |
    Detect exception
       |
    Create/update Situation
       |
    Ellie explains likely cause
       |
    Recommendation
       |
    Authorized operator chooses action
       |
    Work Item / operational action
       |
    Payment/service evidence updates
       |
    Verification
       |
    Situation resolved or escalated

PAYGo context may enable:

- payment reconciliation
- collections
- customer finance
- service/access status
- customer support
- maintenance
- remote service where legitimately integrated

Financial capabilities are introduced only to the extent the validated pilot requires them.

## 29. First vertical-slice contract

The first V2 implementation must prove:

    Channel
      ->
    Identity resolution
      ->
    Organization authorization
      ->
    Customer/site/asset context
      ->
    Evidence/event
      ->
    Situation
      ->
    Ellie recommendation
      ->
    Human authorization
      ->
    Work
      ->
    Action
      ->
    Verification
      ->
    Resolution/learning

The slice succeeds only if it demonstrates:

1. correct tenant isolation;
2. correct actor/organization context;
3. useful operational context;
4. a traceable recommendation;
5. explicit authorization before consequential action;
6. accountable work;
7. evidence-backed verification.

## 30. What must be proven before expanding the schema

### Product

- What exact operational problem do pilot operators pay to solve?
- Which exceptions occur frequently enough to justify automation/intelligence?
- What is current detection time?
- What is current resolution time?
- How much operator/technician time is consumed?
- What is the cost of unresolved incidents?
- What evidence already exists in customer systems?
- Which actions can Enerlectra safely assist with?

### Organization model

- Which business models actually coexist within target companies?
- Which capabilities are common across EPC and PAYGo pilots?
- Which differences require configuration versus separate domain concepts?
- Which policies differ materially between organizations?
- Which responsibilities differ by company?

### Technical

- What is the minimum reliable identity resolution path?
- What is the minimum organization membership model?
- Which events are authoritative?
- What evidence sources are trustworthy?
- Which actions require approval?
- Which actions can eventually be automated?
- Which data needs retention/audit guarantees?

Do not solve unknown questions with speculative abstractions.

## 31. Explicitly deferred capabilities

Unless pilot evidence changes the decision:

- universal billing system
- universal financial ledger
- treasury
- payment orchestration platform
- energy marketplace
- P2P trading
- PCU
- token economy
- staking
- blockchain
- cluster governance
- generalized no-code workflow builder
- generalized AI agent marketplace
- every possible energy asset type
- every possible energy business model
- autonomous consequential actions without authorization
- cross-tenant benchmarking based on raw customer data

## 32. Initial schema direction — not SQL

The eventual V2 schema should be derived from the approved domain.

### Identity and tenancy

    actors
    organizations
    memberships
    roles/permissions
    channel_identities

### Organization configuration

    operating model configuration
    organization capabilities
    organization policies

### Customer and infrastructure

    customers
    sites
    assets

### Operations

    observations
    events
    situations
    work_items
    actions
    verifications

### Intelligence

    recommendations

### Communication

    communication_messages

### Governance

    audit/evidence

Financial/payment entities are added only when a validated workflow requires them.

## 33. Design constraints

V2 must not:

- create epc_customers, paygo_customers, or minigrid_customers;
- create separate domain schemas per business model;
- make business-model type the authorization mechanism;
- trust client-supplied organization IDs;
- allow AI recommendations to bypass authorization;
- expose service-role credentials to clients;
- make settlement the center of the operational domain;
- make telemetry mandatory for every organization;
- assume every company owns the assets it operates;
- assume every customer is an authenticated Actor;
- assume every organization uses the same payment or service model;
- introduce a generic workflow DSL before real workflows require it.

## 34. Architecture acceptance tests

### Multi-tenancy

- Three organizations can operate on one platform.
- No organization can access another organization's raw data.
- Membership controls organizational scope.
- Tenant context survives API, database, jobs, webhooks, storage, and AI operations.

### Business-model flexibility

- An EPC and PAYGo organization can use the same core entities.
- Their capabilities can differ.
- Their policies can differ.
- Their workflows/playbooks can differ.
- Neither requires a separate customer/site/asset domain.

### Operational loop

- Evidence can become an event.
- Events can form a situation.
- A situation can produce a recommendation.
- A recommendation does not automatically execute.
- Authorized work can be assigned.
- Actions produce evidence.
- Verification can close or reopen the situation.

### Identity

- Actor is distinct from Customer.
- Membership is distinct from authentication.
- Channel identity is not authorization.
- Multi-organization actors are supported.

### Legacy separation

- V1 trading/cluster/PCU concepts are not prerequisites for V2.
- V2 does not depend on the legacy database schema.
- Legacy financial capabilities remain isolated until required.

## 35. Decision log

### DEC-001 — Separate V2 data boundary

Decision: V2 should use a clean data boundary rather than converting the historical database in place.

Reason: The existing database contains multiple incompatible product eras, inconsistent tenant concepts, security drift, and an unreconciled migration history.

### DEC-002 — Shared multi-tenant platform

Decision: Initial V2 should support multiple organizations in one shared platform/database using strict tenant isolation.

Reason: Separate databases per customer are unnecessary for the initial SaaS model. Organization-scoped authorization and database-level RLS provide the primary isolation mechanisms.

### DEC-003 — Organization is the tenant

Decision: Organization is the canonical tenant/security boundary.

Reason: Users may belong to multiple organizations and customer records must not be treated as user identities.

### DEC-004 — Actor ≠ Customer

Decision: Keep actor identity separate from customer relationship.

Reason: A customer may not be an application user; employees/operators are actors acting through organizational memberships.

### DEC-005 — Business model is configuration

Decision: Business model is operating-model context, not organization identity.

Reason: Real companies can combine or change commercial/service models.

### DEC-006 — Capabilities over rigid archetypes

Decision: Capabilities determine what an organization actually operates through Enerlectra.

Reason: A business-model label alone does not accurately describe operational responsibilities.

### DEC-007 — Stable operational kernel

Decision: Customer, Site, Asset, Evidence, Event, Situation, Recommendation, Work, Action, Verification form the core operational vocabulary.

Reason: These concepts remain useful across materially different energy businesses.

### DEC-008 — No generic workflow engine yet

Decision: Do not build unrestricted organization-defined workflows.

Reason: It would create a second product and obscure the validated operational wedge.

### DEC-009 — Ellie is context-aware but not authoritative

Decision: Ellie receives organization, role, capability, policy, and operational context and may recommend actions, but authorization remains outside the AI layer.

Reason: Intelligence must not become an authorization bypass.

### DEC-010 — Financial domain is subordinate

Decision: Financial/payment functionality is introduced only when a validated operational workflow requires it.

Reason: V2 is an operational-intelligence product, not a settlement engine.

## 36. Unresolved decisions

1. Exact representation of mixed business models.
2. Whether operating-model configuration requires dedicated persisted entities or a smaller configuration structure.
3. Exact role/permission granularity after pilot observation.
4. Exact Situation/Incident persistence model.
5. Exact relationship between Work Item and Action.
6. Which evidence sources are authoritative for each pilot.
7. Whether payment exceptions require financial capability tables in the first vertical slice.
8. Whether contracts must be first-class in the initial schema.
9. Whether assets need a separate installation/commissioning submodel immediately.
10. Which organization policies are configurable versus platform-defined.
11. Exact RLS implementation and helper-function strategy.
12. Storage/file isolation requirements.
13. AI retrieval/embedding tenancy controls.
14. Data retention and deletion requirements.
15. Minimum telemetry/monitoring capability, if any, required by the first pilot.

## 37. Final V2 contract

Enerlectra V2 is:

> A multi-tenant operational-intelligence platform with a stable operational kernel and organization-specific operating models, capabilities, and policies.

Its center of gravity is:

    Evidence
      ->
    Operational understanding
      ->
    Situation
      ->
    Recommendation
      ->
    Authorized work
      ->
    Action
      ->
    Verification
      ->
    Learning

Its security boundary is:

    Actor
      ->
    Membership
      ->
    Organization
      ->
    Authorized resource

Its business-model boundary is:

    Organization
      ->
    Operating model
      ->
    Capabilities
      ->
    Policies
      ->
    Applicable workflows

Its architectural discipline is:

> Do not build a different product for every energy business. Build one operational language that can correctly understand how each business operates.

## 38. Next artifact

The next artifact is a V2 Domain-to-Schema Design derived from this blueprint.

Only after that design is reviewed should we:

1. create the V2 Supabase project;
2. establish the first migration baseline;
3. implement identity/tenancy/RLS;
4. implement the minimum customer/site/asset model;
5. implement the first operational vertical slice;
6. test the same kernel against EPC and PAYGo contexts;
7. expand capabilities based on evidence.
