# V2 Repository Reconstruction Progress

## Target

Enerlectra remains one application. The existing repository is being progressively reconstructed around the V2 operational domain. V2 is not a second permanent application.

- Active target database: `enerlectra-v2`
- Legacy database: `enerlectra-prod`, unchanged during this gate
- Legacy V1 domain: temporary source/reference only
- No permanent `client/v1`, `client/v2`, `server/v1`, or `server/v2` split

## Gate: Platform / Identity Boundary

### Implemented

- Added V2-only server configuration at `server/src/platform/config/v2.ts`.
- Added server-only V2 Supabase admin client at `server/src/platform/supabase/v2-admin.ts`.
- Added the V2 tenant-context contract at `server/src/platform/tenant/context.ts`.
- Added a transitional V2 browser client at `client/src/lib/supabase-v2.ts`.
- Added V2 environment placeholders to `.env.example` and `client/.env.example`.
- Added repository boundary tests at `test/v2-boundary.test.mjs`.
- Extended the existing test command to run the V2 boundary tests.

### Security properties established

1. V2 server configuration reads only `V2_SUPABASE_URL` and `V2_SUPABASE_SERVICE_ROLE_KEY`.
2. Missing V2 server variables fail closed at configuration-read time.
3. Browser V2 configuration accepts only `VITE_V2_SUPABASE_URL` and `VITE_V2_SUPABASE_PUBLISHABLE_KEY`.
4. No service-role credential is present in the browser V2 module.
5. Tenant context is an explicit contract and does not treat a client-supplied `organization_id` as authorization proof.
6. V2 platform modules contain no imports of quarantined legacy domains.

## Deliberately unchanged

- `server/src/index.ts` still runs the existing application.
- Legacy Supabase environment variables remain active for the current runtime.
- `client/src/lib/supabase.ts` remains the existing client boundary.
- No V1 routes/pages were deleted.
- No legacy database objects were modified.
- No V2 operational tables were created beyond the existing foundation.
- No Ellie behavior was changed.

## Current V2 database state

The target project `enerlectra-v2` is healthy and contains the foundation migrations:

1. `001_foundation`
2. `002_foundation_security_hardening`

Foundation entities are organizations, actors, roles, permissions, role_permissions, memberships, and channel_identities.

## Gate: Authenticated Tenant Context

### Implemented

- Added `server/src/platform/tenant/resolver.ts`.
- Resolver verifies the Supabase access token before resolving any Enerlectra actor.
- Actor status must be `ACTIVE`.
- Organization access requires an `ACTIVE` membership; invited, suspended, and revoked memberships are excluded.
- A supplied `organizationId` is only accepted when the authenticated actor has an active membership in that organization.
- Multiple active memberships require explicit organization context.
- Organization status must be `ACTIVE`.
- Role and role-derived permissions are resolved from the verified membership.
- Added executable tenant-context tests covering successful resolution, forged organization context, inactive actors, and ambiguous memberships.

### Security invariant proven in code

`access token → auth.users identity → actor → active membership → active organization → role → permissions → TenantContext`

No client/channel-supplied organization identifier is treated as authorization proof.

## Gate: Customer / Site / Asset Foundation

### Implemented

- Added V2 `customers`, `sites`, and `assets` tables.
- Every operational record has a direct `organization_id` tenant boundary.
- Added indexes for tenant and relationship access paths.
- Added strict status/check constraints and timestamp maintenance.
- Enabled and forced RLS on all three tables.
- CRUD policies are permission-gated through the private tenant authorization helpers.
- Added composite tenant-scoped foreign keys so a site or asset cannot reference a customer/site belonging to another organization.
- Applied migrations `003_customer_site_asset_foundation` and `004_customer_site_asset_tenant_integrity` to `enerlectra-v2`.

### Domain boundary

`Organization → Customer → Site → Asset` is a valid operational relationship, but it is **not** the canonical identity hierarchy. Each record remains directly tenant-scoped, and site/asset relationships are optional where the operating model requires them.

## Next gate

**Evidence / Events foundation.**

The next implementation must derive:

`authenticated user → actor → active membership → organization → role → permissions → TenantContext`

It must reject:

- missing authentication
- disabled/suspended actor
- missing membership
- invited/revoked/suspended membership
- nonexistent organization context
- organization mismatch
- channel-supplied organization claims used without verified membership

Only after this gate is proven should the repository move to Customer / Site / Asset.
