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

## Next gate

**Authenticated tenant-context resolution.**

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
