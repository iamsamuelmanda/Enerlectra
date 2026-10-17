# Onboarding boundary deployment gate

The onboarding browser must call the authenticated API endpoints mounted by the
canonical server:

- `POST /api/onboarding/organizations`
- `POST /api/onboarding/invitations/accept`

The server verifies the bearer token with Supabase Auth and requires a confirmed
email. Only then does it call the service-role-only RPCs introduced in migration
058. The browser must never call the legacy onboarding RPCs directly.

## Required release sequence

1. Review migration `058_server_verified_onboarding.sql` against the target
   database schema and current Supabase migration history.
2. Apply migration 058 to a disposable/test Supabase database first.
3. Run `npm test`, `npm run typecheck:server`, `npm run typecheck:client`,
   and `npm run build:client` on the exact PR head. Run the live onboarding
   integration gate with `REQUIRE_LIVE_INTEGRATION=true` only against an
   isolated test project with dedicated credentials.
4. Verify in that database that authenticated and anon roles cannot execute
   either `server_*` RPC, service_role can execute them, invalid or unverified
   sessions are rejected, mismatched invitation emails are rejected, expired
   invitations are rejected, owner claim creates OWNER authority, and organization
   creation plus invitation issuance rolls back together on failure.
5. Confirm the frontend build is deployed with this backend and migration.
   Do not enable the new frontend against a database that has not applied 058.

Migration 058 has **not** been applied to production as part of this code change.
The existing GitHub Actions runs were not assigned a runner, so they are not
evidence that tests or builds passed. Do not merge until executable CI/test
evidence and the isolated database checks are recorded.
