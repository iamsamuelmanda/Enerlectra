# Enerlectra V2 — Cross-Slice Architecture Review & Schema Freeze

Status: V2 architecture gate / frozen implementation boundary
Date: 2026-09-18

## 1. Decision

The EPC and PAYGo slices validate the same operational kernel. The first V2 implementation subset is now frozen. This does not mean the entire Enerlectra domain is complete; it constrains the next database and application implementation to the smallest shared kernel proven by both slices.

Decision: proceed to V2 Supabase creation and Migration 001 after this freeze is accepted.

V2 remains one shared multi-tenant operational kernel with multiple organization operating models. EPC and PAYGo are validation slices, not the boundaries of the product.

## 2. Cross-slice result

Both slices traverse: Customer → Site → Asset → Observation/Evidence → Event → Situation → Recommendation → Authorization → Work Item/Action → Verification.

EPC changes the interpretation toward installation and service operations. PAYGo changes the interpretation toward payment and service exceptions. No separate EPC or PAYGo versions of the core primitives are required.

## 3. Decisions resolved

### Organization
organizations is the single canonical V2 tenant entity. There is no V2 organisations alternative. Every tenant-owned resource has direct, non-null organization_id.

### Identity
Actor → Membership → Organization is canonical. Actor is distinct from Customer and Organization. Channel identity identifies an external channel identity; it does not establish tenant authority.

### Roles
The blueprint begins with OWNER, OPERATOR, VIEWER, while the slices expose operational responsibilities such as technician and finance. Resolution: keep a small permission-based role vocabulary. Initial candidates are OWNER, OPERATOR, TECHNICIAN, FINANCE, VIEWER. Do not create a role for every job title; responsibility can also be expressed through permissions, capabilities, and assignments.

### Business models
Business models are configuration and context, not authorization and not separate schemas. An organization may combine multiple models.

### Capabilities
Capabilities describe what an organization has enabled. Permissions describe what an actor may do. A capability never grants actor authority by itself.

### Customer, Site, Asset
Site is first-class. V2 does not force the legacy Organization → Customer → Asset shape. Customer, Site, and Asset have explicit relationships appropriate to the operating model.

### Evidence and Observation
Observation is the normalized entry point for raw or minimally interpreted evidence. Payment evidence, technician reports, customer messages, telemetry, and webhook observations can use this model. Payment evidence is not automatically authoritative financial accounting.

### Event
Events are normalized occurrences with provenance and correlation metadata. The event taxonomy remains extensible rather than becoming a giant universal enum.

### Situation
Situation is the operational interpretation layer. It is not merely an alert and is not a commitment to build a generic incident-management suite.

### Recommendation
Recommendation is derived and non-authoritative. Recommendation ≠ Authorization ≠ Action. Ellie cannot authorize itself.

### Work
Work Item is the cluster-independent execution primitive. Legacy cluster_id is not part of V2 work.

### Verification
Work completion and successful resolution are distinct. A situation is verified resolved only when evidence supports the intended outcome.

### Financial boundary
The PAYGo slice does not justify importing the legacy financial architecture. V2 initially records the payment evidence needed to resolve operational exceptions. Full accounting, settlement, treasury, wallets, and PCU remain separate capabilities requiring independent validation.

## 4. First V2 schema subset

Foundation: organizations, actors, memberships, roles, permissions, role_permissions, channel_identities.

Organization configuration: operating_model_profiles, operating_model_business_models, organization_capabilities, organization_policies.

Customer/infrastructure: customers, sites, assets.

Evidence: observations, events.

Operational work: situations, situation_evidence, situation_assignments, work_items, work_evidence, actions, verifications.

Intelligence: recommendations.

Communication: communication_messages.

Governance: audit_records.

No additional V2 table should be introduced merely because it existed in V1.

## 5. PAYGo boundary clarification

The first PAYGo slice needs payment evidence but not a complete financial subsystem. Initially this may be represented through Observation/Evidence. A dedicated payment-reference entity is deferred until pilot validation proves a distinct lifecycle, reconciliation requirement, or integration contract requires it.

This prevents premature recreation of the legacy settlement and treasury model.

## 6. RLS freeze

Tenant boundary: authenticated Actor → active Membership → Organization → tenant-scoped Resource.

Required invariant: no actor may read, create, update, or delete tenant-scoped data outside an organization for which the actor has an active membership and the required permission.

Required properties: direct organization_id; non-null tenant ownership; RLS enabled; explicit SELECT/INSERT/UPDATE/DELETE policy strategy; no client-supplied organization ID as authorization proof; fail-closed missing context; tenant-consistent parent/child relationships; role/permission enforcement; service-role restriction.

## 7. Tenant-context propagation freeze

Tenant context must survive every access path: Web/API, WhatsApp, approved webhooks, background jobs, storage, exports, caches, and Ellie/AI retrieval.

Every path must resolve or receive a trusted organization context and enforce it before accessing tenant data. No default-org fallback is permitted.

## 8. Shared-kernel acceptance test

EPC: reported fault or delayed installation → evidence → event → situation → recommendation → authorized work → verification.

PAYGo: payment evidence → event/exception → situation → recommendation → authorized resolution/work → verification.

Both must use the same Customer, Site, Asset, Observation, Event, Situation, Recommendation, Work, and Verification primitives. Differences belong in operating-model context, capabilities, policies, permissions, and workflow interpretation.

## 9. Explicit V2 exclusions

PCU; energy wallets; energy listings; energy requests; P2P trading; matching engine; clusters; cluster economics; ownership shares; staking; blockchain energy trading; blockchain settlement; treasury subsystem; legacy settlement engine; universal financial ledger; automated remote disconnection/reconnection; consumer credit scoring; generalized no-code workflow builder; separate schemas per business model; comprehensive ERP/project-management suite; telemetry dependency for the first slice.

These may be reconsidered only through explicit architectural review.

## 10. Migration boundary

Migration 001 establishes only the foundation required for organizations, actors, memberships, roles, permissions, role permissions, channel identity relationships, and tenant isolation primitives.

Subsequent sequence: 001 Foundation; 002 Organization configuration; 003 Customer/Site/Asset; 004 Evidence/Events; 005 Situations/Work/Verification; 006 Intelligence/Communication/Audit.

A financial capability migration is not part of the initial sequence.

## 11. Legacy database rule

The existing enerlectra-prod database remains frozen legacy/reference infrastructure.

Do not rename its tables into V2, add V2 tables to gradually turn it into V2, import its 70+ table model wholesale, or use its migration history as the V2 baseline.

Before destructive legacy cleanup, preserve a snapshot and verify actual dependencies and row counts.

## 12. Implementation acceptance criteria

- One canonical tenant table.
- Actor/membership authorization chain works.
- Multiple memberships per actor are supported.
- Every tenant-owned resource has organization scope.
- RLS is fail-closed.
- INSERT/UPDATE tenant-ID tampering is rejected.
- Parent/child tenant mismatches are rejected.
- Role/permission restrictions work.
- Membership revocation removes access.
- Channel identities cannot establish unauthorized tenant access.
- Webhook tenant binding is trusted.
- Background jobs carry tenant context.
- Ellie retrieval is tenant-scoped before model access.
- Service-role credentials are server-only.
- Cross-tenant attack tests use real authenticated identities.
- EPC and PAYGo traverse the shared kernel without separate schemas.

## 13. Remaining unknowns

Exact active-organization session/JWT strategy; exact permission names; exact webhook providers; storage implementation; customer/site relationship cardinalities; evidence attachment requirements; precise payment-provider mappings; verification independence requirements; audit/retention periods; first production integration set.

These do not invalidate the architecture freeze and should be resolved during implementation and pilot validation.

## 14. Final gate decision

Architecture status: FROZEN FOR FIRST IMPLEMENTATION SUBSET.

The next technical action is no longer another conceptual domain artifact. It is: NEW V2 SUPABASE PROJECT → REPRODUCIBLE MIGRATION 001 → FOUNDATION + RLS → SECURITY TESTS → CUSTOMER/SITE/ASSET → EVIDENCE/EVENT → SITUATION/WORK/VERIFICATION.

This freeze does not claim EPC and PAYGo are the only markets. They are the first two operating-model validations for a broader distributed-energy operational platform.