# Ownership, Authority, Onboarding, and Operational-Issue Reconciliation

**Status:** Architecture decision record — implementation and isolated-project verification completed on the preceding code head; final documentation refresh follows  
**Branch:** `reconstruction/platform-identity-boundary-merged`  
**MR:** !39  
**Implementation evidence:** GitLab MR !39; latest code verification before this documentation refresh passed all six pipeline jobs, including isolated Supabase integration gates.  
**Scope:** Organization authority semantics, onboarding relationships, transfer permissions, tenant-isolation tests, and customer operational-issue error visibility.

 > This document records the architecture decision and implementation evidence. Verification is limited to the isolated `enerlectra-v2` test project; production was not migrated or mutated. Keep MR !39 in draft until the final documentation-refresh head also passes all gates.

## 1. Executive decision direction

Enerlectra should distinguish **who created a workspace**, **who can administer it**, **who operates its energy assets or workflows**, and **who legally owns a company or asset**. These are different relationships and must not be collapsed into a single `owner` concept.

The database's existing `OWNER` role is an authorization role: it represents broad authority within one Enerlectra organization. It does **not** establish equity ownership, legal title to a business, ownership of an energy asset, or exclusive personal ownership of the organization's data.

Keep the internal role key `OWNER` for now. Do not rename enums, role keys, or schema columns just to improve user-facing language. First agree the user-facing term, record it here, and then implement a deliberate presentation-layer mapping with backward compatibility.

**Approved user-facing terminology:** **Organization Lead**. Use “Lead” as a compact UI label only where the organization context is unmistakable. The product owner approved this term on 29 October 2026. Keep the database role key `OWNER` unchanged and map it to the approved display label; this is a presentation-layer decision, not a schema rename.

## 2. Core vocabulary and boundaries

| Concept | Meaning | Must not be confused with |
|---|---|---|
| Authenticated user | A verified login identity supplied by the authentication system | Organization membership or authorization by itself |
| Actor | Enerlectra's canonical application identity associated with a verified auth identity | A role or a tenant |
| Organization membership | The relationship that gives an actor a place in a particular organization | Global access to every organization |
| Role | A named bundle of responsibilities assigned within a membership | A permanent hierarchy or legal title |
| Permission | A specific action the actor is allowed to perform in context | Proof that the actor owns an asset |
| Creator / `created_by_actor_id` | Provenance: the actor who initiated creation | Permanent authority or a guarantee that the creator remains a member |
| Internal `OWNER` role | Broad organization-scoped authority, subject to enforced policies | Legal ownership, equity, asset title, or exclusive ownership |
| Operating responsibility | Permission/responsibility to configure, operate, maintain, or manage workflows/assets | Legal ownership of those assets |
| Legal/business ownership | A real-world relationship, potentially involving entities, shares, evidence, dates, and jurisdiction | An Enerlectra access-control role |
| Platform support | A privileged support capability outside ordinary tenant membership | An ordinary member of every customer organization |

### Authority chain

The intended decision path is:

`verified authentication → canonical actor → active organization membership → role(s) → permission(s) → server-side authorization and database/RLS enforcement`

Every step matters. A valid login does not grant tenant access; membership in one organization does not imply access to another; and a client-supplied organization ID is not proof of authorization.

### Creator is not owner

`created_by_actor_id` records who initiated the organization. It is useful for audit and provenance, but should not be the enduring source of authorization. The creator may be a consultant, installer, employee, delegated operator, or an individual who later leaves. Authority must be determined by active membership and permissions.

### Asset and company ownership are separate domain facts

An organization may operate an asset it does not legally own. If Enerlectra later needs to model ownership of an energy system, company, meter, site, or other asset, represent that relationship separately with the relevant subject, holder, evidence/provenance, effective dates, and verification status as appropriate. Do not infer title from `memberships.role_id = OWNER`.

## 3. Recommended organization-authority model

1. **Organization-scoped authority.** The broad authority role applies only to the organization in which the membership exists.
2. **Permission-based actions.** Roles bundle permissions; authorization checks should be based on the required permission, active membership, target organization, and relevant state.
3. **Multiple active top-level authorities.** Allow more than one authorized lead so an organization is not dependent on one person's account. Avoid silently making every operator a top-level authority.
4. **At least one active authority for an active organization.** Prevent accidental removal or demotion of the final authorized lead.
5. **Verified handover.** Transfer authority through an authenticated, auditable workflow. The successor must be identified and accept where the workflow requires acceptance. The old lead should only be demoted or removed after the successor's authority is successfully established.
6. **Separate recovery.** A lost-account, disputed business claim, or support-assisted recovery path must be explicit, verified, auditable, and protected from routine tenant-member operations.
7. **Platform support is distinct.** Support personnel should not be represented as ordinary tenant owners merely to make support operations convenient.
8. **Server-owned security boundary.** The browser/client must not call privileged security-definer RPCs directly if the current architecture intentionally routes those operations through a trusted server.
9. **Tenant isolation is independent of role checks.** Even an authenticated, authorized user must not be able to read or mutate another tenant's data by changing an ID. Test both authorization and isolation.
10. **Auditable lifecycle.** Creation, invitation, acceptance, authority changes, transfer, recovery, and support intervention should leave suitable audit evidence without leaking secrets or unnecessary personal data.

## 4. Current source findings (reviewed; not yet fixed)

### 4.1 Onboarding server route

At the reviewed head, `server/src/routes/onboarding.ts`:
- Verifies the bearer token through Supabase Auth and requires a valid user ID, email, and `email_confirmed_at`.
- Organization creation accepts `OWNER` or `DELEGATED_OPERATOR` intent and calls the service-only `server_create_onboarding_organization` RPC with verified identity details.
- Invitation acceptance validates the session and invitation-token shape, then calls `server_accept_organization_invitation`.
- Known errors are mapped to specific response codes; other onboarding failures are generalized.
- A dedicated server-side ownership-transfer API was not observed during this review. Confirm before implementing one.

### 4.2 Migration 058 and privilege boundary

`supabase/v2/migrations/058_server_verified_onboarding.sql` establishes the intended server-verified onboarding flow:
- Owner-led creation creates an active organization and owner membership.
- Delegated creation creates a pending organization and a time-limited owner-claim invitation; the invitation token is stored as a hash.
- Invitation acceptance checks token state/expiry and verified-email matching before activating the organization and assigning authority.
- The functions are revoked from `public`, `anon`, and `authenticated`, with execution granted to `service_role`.
- The migration revokes the legacy delegated-onboarding RPC to avoid an alternate, weaker path.

Prior deployment evidence records migration 058 on production as version `20261015014615`. This is documentation of prior evidence, not permission to mutate production. All integration tests must use the dedicated test Supabase project and verify its migration history independently.

### 4.3 Why the current ownership test contradicts the security boundary

The existing `test/v2-self-service-onboarding.test.mjs` still invokes legacy browser-facing RPCs directly, including `transfer_organization_ownership`, and queries relationship embeds such as `roles(key)`. But migration 053 intentionally revokes direct `authenticated` execution on sensitive security-definer RPCs and grants execution to `service_role` only; migration 058 establishes server-mediated onboarding.

Therefore, a test expecting a browser user's direct RPC call to succeed conflicts with the current security design. **Do not fix this by restoring authenticated execution on privileged RPCs.** Update tests to exercise the public server API and prove that unauthorized direct calls are denied. If ownership transfer remains a supported action, expose it through a verified server route that derives the actor from the session, checks the actor's membership/permission and organization state, invokes the trusted RPC, and returns a safe result.

The final-owner failure currently reports `permission denied for function transfer_organization_ownership`, while cleanup reports `ORGANIZATION_MUST_HAVE_ACTIVE_OWNER`. The first indicates the test is calling across the intended boundary; the second may be a cascading cleanup failure. Rework setup/cleanup and report the original failure without treating cleanup as the root cause.

### 4.4 Ambiguous onboarding relationship query

The integration failure includes PostgREST `PGRST201`: embedding `roles` from `memberships` is ambiguous because more than one relationship path exists (reported as `roles!memberships_role_id_fkey` and `roles!membership_roles`).

Use the intended foreign-key relationship explicitly in each embed, for example `roles!memberships_role_id_fkey(key)` for the primary membership role, or the actual `membership_roles` foreign key for additional roles. Verify the exact FK names from the current schema rather than copying the example blindly. Where both primary and additional roles are relevant, query them separately or explicitly label each relationship so the result is unambiguous.

### 4.5 Customer operational issues: hidden database failure

`server/src/services/customerOperationalIssues.ts` calls `create_customer_operational_issue` through the server's service-role database client. Migration 041 introduced the transactional workflow, but later migrations may have changed the function signature or dependencies; verify the latest effective definition and grants before editing SQL.

The failing API test expected HTTP 201 but received HTTP 500 with public code `CUSTOMER_OPERATIONAL_ISSUE_FAILED`. The integration output did not reveal the underlying database cause. The current generic public response may be appropriate for security, but internal diagnostics are insufficient.

Required resolution:
- Trace the request using a correlation/request ID.
- Log a safe, structured internal error category and database error code, plus the failing operation/stage where available.
- Do not log access tokens, invitation tokens, service-role keys, raw sensitive payloads, or unnecessary PII.
- Keep the public response generic and stable; never expose SQL details to clients.
- Surface redacted diagnostics in the test job log so a 500 can be diagnosed.
- Compare the runtime RPC argument names/types against the latest effective SQL signature and verify dependent table constraints, RLS assumptions, and service-role grants.
- Add tests proving success and expected failure mappings.

Do not guess at a database fix until the real error has been captured.

## 5. User-facing terminology — approved

The label should be understandable to a first-time small-business customer, short enough for buttons and member lists, and strong enough to convey responsibility. It must not imply legal title, shareholding, asset ownership, or an unlimited right over other people's property.

| Candidate | Strength | Risk / trade-off |
|---|---|---|
| **Organization lead** | Plain-language, responsible, approachable; distinguishes a lead from an asset owner | Slightly longer; “lead” may sound less formal in some contexts |
| **Lead** | Short and memorable in compact UI | Too vague without context in onboarding or audit logs |
| **Organization manager** | Familiar and clear about managing a workspace | Can imply day-to-day operations rather than ultimate authority; may be confused with an operator |
| **Organization owner** | Familiar to many users and aligns with current internal key | Continues the exact ambiguity this work is trying to remove; avoid as user-facing label unless the user explicitly chooses it |
| **Steward** | Conveys care and responsibility rather than property title | Less familiar to many customers; may require explanation |
| **Principal** | Strong, formal, suggests primary responsibility | Legal/financial connotations; may feel intimidating |
| **Account lead** | Familiar in service/business contexts | “Account” may mean billing or a login, not an organization |
| **Organization admin** | Shorter than administrator and common in software | Still technical jargon and less approachable to non-technical users |

### Approved decision

Use **Organization Lead** in onboarding/help text and member-management screens, with **Lead** only where the organization context is unmistakable. Internally map this presentation label to the existing `OWNER` role without renaming the database key. Use explanatory copy such as: “Leads manage access and key organization settings. This role does not establish legal ownership of a business or energy asset.”

The product owner approved this terminology on 29 October 2026. Apply it consistently to:
- role display name;
- onboarding choice and explanation;
- member list and role-change dialog;
- transfer/handover flow;
- audit events and support/recovery copy;
- error messages and help documentation.

Do not call the person a “lead” in one screen and “owner” in another unless “owner” is explicitly describing a separate legal-ownership domain concept.

## 6. External patterns reviewed

These references inform the principles; they do not override Enerlectra's domain requirements.

- **Microsoft, SaaS identity and access:** one identity can access multiple tenants, with access granted per tenant. This supports separating identity from tenant-specific authorization. https://learn.microsoft.com/en-us/azure/well-architected/saas/identity-access
- **OWASP, Multi-Tenant Security Cheat Sheet:** derive tenant context from verified identity, enforce tenant boundaries server-side and at the data layer, and test cross-tenant access. https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- **GitHub, organization roles:** roles bundle permissions; broad owner powers should be limited and narrower responsibilities delegated where possible. https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization
- **PostgREST, API relationship embedding:** ambiguous foreign-key paths require an explicit relationship selector. https://docs.postgrest.org/en/v10/api.html

## 7. Required test strategy and acceptance criteria

### A. Onboarding and authority
- [ ] Owner-led organization creation through the authenticated server endpoint succeeds and creates the expected actor, organization, membership, and authority assignment.
- [ ] Delegated onboarding creates a pending organization and a hashed, expiring owner-claim invitation.
- [ ] Acceptance succeeds only for a verified matching email and valid, unexpired, unused token.
- [ ] Wrong email, invalid/expired/reused token, unverified identity, missing role, and inactive actor are denied with stable safe errors.
- [ ] Creator provenance is recorded but does not silently confer permanent authority after membership changes.
- [ ] The user-facing label maps to internal `OWNER` without schema-wide renaming.

### B. Privilege boundary and transfer
- [ ] Sensitive security-definer RPCs remain unavailable to `anon` and `authenticated` where the service-only boundary is intended.
- [ ] The public server route derives actor identity from a verified session; it does not trust a caller-supplied actor ID.
- [ ] Non-leads cannot initiate a transfer; cross-organization IDs cannot be used to transfer authority.
- [ ] A valid successor acceptance and transfer are atomic and auditable.
- [ ] The last active lead cannot be demoted or removed; a failed transfer leaves the original valid authority state intact.
- [ ] Recovery is separately authorized, verified, and audited.
- [ ] Test teardown does not violate the active-authority invariant or mask the original assertion failure.

### C. Tenant isolation
- [ ] Two independently seeded test organizations and actors are used.
- [ ] Cross-tenant read and write attempts are denied even when a valid actor changes organization/resource IDs.
- [ ] Role/permission checks and RLS are both tested; passing one does not substitute for the other.
- [ ] Test fixtures and cleanup are isolated from production.

### D. Relationship query and operational issue
- [ ] Every ambiguous PostgREST relationship embed uses an explicitly verified FK path.
- [ ] A valid operational issue request returns the documented success status and creates the intended atomic record set.
- [ ] Invalid input, missing permission, tenant mismatch, and database failures return stable public errors.
- [ ] The integration log exposes redacted internal error code/category and correlation ID without secrets or PII.
- [ ] The service RPC call matches the latest effective SQL signature and service-role grant.

### E. Release gate
- [ ] Verify the exact MR head SHA before interpreting test results.
- [ ] Run unit/regression, typecheck, build, security audit, and authenticated integration tests on that exact head.
- [ ] Confirm the isolated test project's migration history and required CI variables without printing secret values.
- [ ] Record each result as PASS, FAIL, BLOCKED, or NOT VERIFIED with evidence.
- [ ] Do not merge while authenticated onboarding, transfer security, tenant isolation, or operational issue diagnostics remain unverified.
- [ ] Do not apply experimental migrations or destructive tests to `enerlectra-prod`.

## 8. Implementation sequence

1. Update the onboarding/authority specification and relevant UI copy to use the approved **Organization Lead** label, without renaming internal schema identifiers.
3. Replace stale direct-RPC integration tests with tests against the authenticated server API; add explicit negative tests for direct RPC denial.
4. Resolve PostgREST embedding ambiguity using verified FK names.
5. Add or complete the server-side transfer/handover route and preserve the service-only RPC grant.
6. Improve safe structured diagnostics for operational-issue failures; capture the true failing database condition before changing SQL.
7. Complete two-tenant isolation, handover, recovery, cleanup, and operational workflow tests on the isolated test project.
8. Run the full verification suite on the exact MR head and document evidence.
9. Keep MR !39 in draft until the critical security gates pass; do not merge merely because static checks pass.

## 9. Implementation and verification status

Implemented on `reconstruction/platform-identity-boundary-merged`:

- User-facing onboarding copy uses **Organization Lead** while preserving the internal `OWNER` role key and explaining that workspace authority does not establish legal ownership of a business or energy asset.
- Added `server_transfer_organization_ownership`, a service-role-only SECURITY DEFINER RPC that binds the operation to a verified Auth user ID, checks active actor/owner/target membership, preserves multiple owners, and blocks demotion of the final active owner.
- Added `POST /api/onboarding/ownership/transfer`; it verifies a confirmed session, resolves the tenant from the token plus organization header, checks `organization.ownership.manage`, and invokes the server-only RPC. Direct authenticated execution of the legacy transfer RPC remains denied.
- Updated onboarding integration tests to use the authenticated API, assert direct-RPC denial, verify multiple-owner and final-owner behavior, and clean up role assignments before memberships.
- Disambiguated `roles` embeds with the verified foreign keys in onboarding tests and tenant resolvers.
- Added safe structured operational-issue failure diagnostics and failure-stage classification; provider error text and request payloads are not returned to clients or written to the new structured logs.
- Reconciled the live multi-tenant test assertions and fixture cleanup.

**Verification on code head `490694224c6de2e7a8086c4781286aff1ab4fe1a`:**
- Root regression tests and server typecheck: PASS.
- Client typecheck and production build: PASS.
- Telegram bot checks: PASS.
- Enerlectra Core build: PASS.
- Security audit across root, client, Telegram bot and Core: PASS.
- Isolated Supabase authenticated onboarding and tenant-isolation integration: PASS (13 tests, 0 failures).
- Isolated test project `mtyhzvkiuibigjximsix`: migration `059_server_verified_ownership_transfer` applied; SQL privilege check confirmed `service_role` can execute the new RPC and `authenticated` cannot.
- Production database migration or data mutation: NOT performed.

The final terminology-copy and documentation refresh create a newer MR head, so repeat the full suite against that exact head before considering merge. MR !39 remains draft and must not be merged unless the final head's full pipeline, including the manual isolated-project gate, passes.
