# V2 Self-Service Multi-Tenant Onboarding and Authority Model

**Status:** Architecture revision recorded on `reconstruction/platform-identity-boundary`. Migration 028 is prepared but is **not yet applied to the live V2 database**.

## Decision

Enerlectra V2 is a self-service, multi-tenant B2B platform.

A customer organization must be able to:

1. sign up without Enerlectra staff creating the tenant;
2. create its own workspace;
3. establish organizational authority independently from the person who clicked Create;
4. invite additional owners and team members;
5. bring business data progressively;
6. operate inside a strict organization/RLS boundary;
7. recover or transfer ownership without requiring normal Enerlectra staff membership in the tenant.

This follows the core multi-tenant SaaS pattern of customer-controlled organization administration and organization-scoped authorization. Self-service and invitation flows are established approaches for B2B onboarding. citeturn0search0turn1search2

## 1. Identity, relationship, authority, provenance

The canonical model is:

`Auth User → Actor → Membership → Organization`

Authorization is:

`Membership → Role(s) → Permission(s)`

Audit provenance is separate:

- `created_by_actor_id`
- `invited_by_actor_id`
- `accepted_by_actor_id`
- future `approved_by_actor_id`

**Critical invariant:**

`created_by != owner`

Creating an organization records who created it. It does not, by itself, establish permanent business ownership.

This prevents the Chanda/Brian failure mode: an employee can set up a company workspace for the managing director without becoming the permanent owner.

## 2. Organization lifecycle

Operational status remains separate from onboarding authority.

### Onboarding state

- `PENDING_AUTHORITY`
- `ACTIVE`
- `RECOVERY_REQUIRED`

### Normal delegated setup

`SIGN UP → CREATE WORKSPACE → DECLARE RELATIONSHIP → SETUP → OWNER CLAIM → ACTIVE`

If the creator declares that they are the responsible owner, the workspace can start active with an OWNER membership.

If the creator is setting up on somebody else's behalf:

- creator becomes an OPERATOR;
- organization remains `PENDING_AUTHORITY`;
- limited setup capabilities remain available;
- creator can invite the responsible business authority;
- accepting the owner-claim invitation establishes OWNER authority and activates the organization.

The declaration is an onboarding intent, not a client-supplied authorization token. The server derives actor identity from the authenticated session and never accepts a caller-supplied `organization_id` as proof of authority.

## 3. Ownership

OWNER is **organization-scoped authority**, not platform ownership.

Rules:

- multiple active OWNERs are allowed;
- an organization must have at least one active OWNER once active;
- the final OWNER cannot be removed or demoted;
- ownership transfer must be atomic;
- the preferred transfer sequence is: invite/promote successor → successor accepts → old owner leaves/demotes;
- leaving is membership deactivation/revocation, not actor deletion;
- actor history remains intact.

Recovery paths:

1. normal owner-to-owner transfer;
2. verified business claim;
3. audited platform break-glass transfer when normal recovery is impossible.

Platform support is not a normal customer membership. Break-glass actions belong to platform administration and must be separately audited.

## 4. Roles are responsibilities, not hierarchy

Current role vocabulary remains:

- OWNER
- OPERATOR
- TECHNICIAN
- FINANCE
- VIEWER

These are not a reporting chain.

A person can carry multiple responsibilities in one organization. Migration 028 introduces `membership_roles` while retaining `memberships.role_id` as the primary/default role for compatibility.

The existing `organization.manage` permission is retained for compatibility, but the model now separates:

- `organization.setup`
- `organization.members.manage`
- `organization.ownership.manage`

This prevents delegated setup from being equivalent to unrestricted organization administration.

Organization-scoped RBAC is the correct baseline for a multi-tenant application: the same person can have different roles in different organizations, and authorization must be evaluated in the organization context. citeturn0search11

## 5. Data onboarding: Bring Your Data

CSV is not the product capability.

The product capability is:

**BRING YOUR DATA**

All ingestion interfaces feed one canonical pipeline:

`VALIDATE → MAP/NORMALIZE → PREVIEW → COMMIT → REPORT`

Interfaces:

1. **Excel/XLSX** — downloadable template, column detection/mapping, preview, row-level errors.
2. **Guided manual entry** — mobile-first quick-add flows for businesses without structured exports.
3. **Assisted onboarding** — Enerlectra/partner assistance uses the exact same validation and commit pipeline; nobody hand-inserts production rows.
4. **Field capture** — technicians create customer/site/asset records at source, including operational evidence such as serials, photos and location where appropriate.
5. **API** — later, for organizations with established systems.

Data is progressive. A company may begin with five customers and add more over time. A workspace is not blocked waiting for a complete historical import.

## 6. Stable domain kernel

The shared V2 kernel remains organization-scoped:

- customers
- sites
- assets
- observations
- events
- situations
- work
- actions/execution
- verification
- communication/audit

Business-specific operating models should configure how this kernel is used rather than creating separate schemas for each type of energy company.

## 7. Security invariants

Non-negotiable:

- never trust client-supplied organization authority;
- tenant access derives from authenticated identity → membership → role/permission;
- every tenant resource remains organization-scoped;
- RLS remains the database enforcement boundary;
- direct role/membership writes should move toward controlled RPCs for sensitive lifecycle operations;
- invitation tokens are stored hashed;
- invitation acceptance checks the authenticated actor's email against the invitation;
- ownership has a database-level final-owner invariant;
- platform break-glass access is outside tenant membership.

Supabase's current guidance also recommends deriving identity from `auth.uid()`, using RLS for row-level authorization, and treating security-definer functions carefully with a pinned search path. citeturn2search1turn2search0

## 8. Audit result against the previous V2 model

### Correct and retained

- Actor as canonical identity
- Organization as tenant boundary
- Membership as relationship
- Organization-scoped permissions
- RLS on tenant resources
- server-side trusted actor context
- no legacy V1 tenancy concepts

### Incorrect / revised

- creator automatically becoming OWNER
- browser organization creation being disabled
- one role representing every responsibility
- broad `organization.manage` as the only organization administration permission
- no explicit organization onboarding state
- no first-class invitation/owner-claim model
- no database invariant protecting the final owner
- CSV treated as the implied data onboarding model

### Not yet complete

- authenticated integration tests for the full self-service flow;
- owner transfer/recovery workflows;
- application invitation email delivery;
- guided XLSX/manual ingestion UX;
- canonical ingestion job/report tables;
- authenticated cross-tenant isolation tests with two real organizations;
- platform break-glass administration and its audit stream.

These are implementation gates, not reasons to return to manual tenant provisioning.

## 9. Provisioning decision

Do **not** provision the planned first real test user yet.

The architecture must first establish the self-service onboarding boundary. After Migration 028 and its authenticated integration tests are proven, the first real organization can be created through the same customer-facing flow that every later organization will use.
