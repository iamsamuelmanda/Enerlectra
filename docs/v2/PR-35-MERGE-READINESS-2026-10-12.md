# PR #35 — Merge Readiness Checkpoint

Date: 2026-10-12  
Branch: `reconstruction/platform-identity-boundary`  
Reviewed head at checkpoint: `cd871f8615f78e47dc1a4f63d015624bed393f95`  
Decision: **NOT READY TO MERGE**

This checkpoint records the results of the repository, Supabase, workflow, and deployment-configuration review. It deliberately distinguishes code changes from tests that actually executed.

## 1. Migration reconciliation

- The V2 migration directory contained two files with version prefix `056`.
- The un-applied delegated-onboarding file was renamed from `056_atomic_delegated_onboarding.sql` to `057_atomic_delegated_onboarding.sql`. A regression test now requires V2 migration prefixes to be unique and contiguous.
- The `enerlectra-v2` project's migration history is recorded using timestamp versions. Its latest recorded migration is `056_require_verified_outcome_evidence`, version `20261012210024`.
- The live database does **not** currently expose `create_delegated_organization_with_owner_invitation`.
- Migration `053_restrict_security_definer_execution.sql` explicitly restricts `create_organization`, `create_organization_invitation`, and `accept_organization_invitation` to `service_role`. Direct privilege queries confirm that `authenticated` cannot execute these functions.
- The current browser onboarding page still calls those RPCs directly, including the delegated function. The new delegated migration's current grant to `authenticated` conflicts with the documented migration-053 security decision. Do not apply that migration or restore client execution grants as a shortcut. The onboarding flow must be reconciled with a server-side, token-validated onboarding boundary before this gate can pass.
- Render's build/start commands do not run Supabase migrations. Merging the migration files alone will not apply them to the database.

## 2. Deployment reconciliation

The PR changes `render.yaml` materially:

- Changes the bot service root directory from `integrations/telegram-bot` to `integrations/enerlectra-bot`.
- Renames the backend blueprint service from `enerlectra-backend` to `Enerlectra`.
- Changes the backend build command from `npm ci` to `npm ci && npm run build:client`.
- Adds the V2 project URL `https://mtyhzvkiuibigjximsix.supabase.co` and declares `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as externally supplied environment variables.
- Keeps `branch: main` and `autoDeploy: true`.

The root start command is `npm start`, which launches `server/src/index.ts`. That branch replaces the legacy marketplace/settlement runtime with the canonical operational backend, removes legacy routes/jobs, and leaves the WhatsApp webhook disabled with HTTP 503. Therefore, merging this PR to `main` is a **production runtime cutover/redeployment**, not a documentation-only merge. That contradicts any statement that production cutover is excluded.

The Render blueprint also does not declare `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY`, while the browser Supabase client requires those variables. If Render is expected to serve the built client, its actual build environment must be checked before deployment. The live Render service configuration has not yet been inspected; no Render setting has been changed and no deployment has been triggered.

## 3. Test execution integrity

Changes made on this branch:

- Live integration suites now explicitly skip when credentials are absent in ordinary local/unit mode, and fail closed when `REQUIRE_LIVE_INTEGRATION=true`.
- The Authenticated Action Gate sets `REQUIRE_LIVE_INTEGRATION=true` and checks that the required repository secrets are present before running tests.
- Added `test/live-integration-config.test.mjs` to verify that the live suites fail when strict mode is enabled without credentials.
- Added a live Ellie feedback test for evidence-backed learning and rejection of a FAILED verification with no linked evidence.
- Ellie now requires a linked observation or event before learning from either VERIFIED or FAILED outcomes and includes those evidence IDs in memory provenance.
- Ellie inference imports use explicit public Core subpaths, avoiding evaluation of the Core root barrel's unrelated Redis and legacy service exports.

**No current-head test suite has executed yet.** GitHub Actions runs for the current branch repeatedly fail immediately with no runner assigned and no job steps/logs recorded. The latest observed CI run is [38313855481](https://github.com/iamsamuelmanda/Enerlectra/actions/runs/38313855481); the latest Authenticated Action Gate run is [38313855594](https://github.com/iamsamuelmanda/Enerlectra/actions/runs/38313855594). These failures do not establish a test, typecheck, build, or npm-audit failure; they establish that those commands did not run. Repository secret presence therefore remains unconfirmed by a workflow execution.

## 4. Four backend gates

| Gate | Current result | Remaining work |
|---|---|---|
| Authenticated end-to-end workflow | **BLOCKED / NOT RUN** | Resolve the browser-to-server onboarding boundary and the missing delegated RPC; execute the full authenticated flow. |
| Tenant isolation | **NOT RUN on this head** | Execute tenant/context/channel and multi-tenant integration suites. Earlier targeted database checks are not a substitute for current-head execution. |
| Ellie learning and verified outcomes | **CODE UPDATED; NOT RUN** | Execute positive and negative feedback tests against the live test database and verify no unsupported learning event/memory is persisted. |
| Legacy dependency direction | **PARTIAL; NOT RUN** | Execute runtime-boundary tests and finish transitive reachability checks across Core, server, integrations, client, scripts, and deployment entrypoints. |

## 5. Release gates

- Server typecheck: **unknown — command did not execute**.
- Client typecheck/build: **unknown — command did not execute**.
- Root tests: **unknown — command did not execute**.
- Dependency audit: **unknown — command did not execute**.
- Required GitHub secrets: **unconfirmed — workflow failed before its secret-check step**.
- Live Render settings and deployed commit: **not yet inspected**.
- Production migration application: **not performed**.
- Merge: **not approved**.

The security advisor's finding about `organization_invitations` having RLS enabled with no direct client policy is consistent with migration 053's explicit design: direct table access is revoked and invitation lifecycle is intended to run through restricted functions. Keep that boundary intact while fixing onboarding.

## 6. Required next steps

1. Inspect the actual Render service configuration and deployed commit before deciding whether auto-deploy must be disabled or the cutover must be staged separately.
2. Reconcile onboarding with migration 053's service-role-only policy; do not grant authenticated execution merely to make the existing browser test pass.
3. Decide on an isolated, non-production Supabase test target and apply/test migrations there only after the deployment target is confirmed.
4. Restore a functioning test runner or obtain an explicitly approved alternative execution environment; then run the authenticated workflow, tenant isolation, Ellie learning/verification, dependency-direction, typecheck/build, and audit gates.
5. Update this checkpoint with actual command results. Only then reconsider PR #35's draft status and merge readiness.


## 7. Follow-up verification — 2026-10-15

This section supersedes older statements above where the live state has since changed. It records observations, not assumptions.

### Current head and CI execution

- Reviewed head: `b7d77d4dc0955a720a7fd724c8e4ac693a9bbd59`.
- PR #35 remains open and unmerged.
- Current CI run: [38667433989](https://github.com/iamsamuelmanda/Enerlectra/actions/runs/38667433989). Its four jobs (security audit, server typecheck, root install/smoke tests, client typecheck/build) all concluded failure after approximately two seconds, with empty `steps`, `runner_id: 0`, and no runner name.
- Current Authenticated Action Gate: [38667434013](https://github.com/iamsamuelmanda/Enerlectra/actions/runs/38667434013). It likewise failed after approximately two seconds with empty `steps` and no assigned runner.
- These are runner-execution failures, not evidence that the code passed or failed the commands. No current-head test suite, typecheck, client build, or npm audit has been proven to execute.

### Validation deployment

- A separate, free Render validation service was inspected: `Enerlectra-exact-head-validation`, service `srv-db2s6bcs728c73af94qg`, URL https://enerlectra-exact-head-validation.onrender.com.
- Its live deployment is the reviewed head `b7d77d4dc0955a720a7fd724c8e4ac693a9bbd59`. Render completed `npm install`, started `npm start`, connected to canonical Supabase, and marked the service live.
- This service's build command is only `npm install`; it does not run tests, typechecks, client build, or security audit. The install log reported 25 vulnerabilities (1 low, 8 moderate, 15 high, 1 critical); exact packages and fix paths remain unverified because `npm audit` did not execute.
- The validation service is configured with the production Supabase project. Therefore it has only been used for startup validation; no mutating onboarding test was run through it. The production Render service was not redeployed or reconfigured during this validation.

### Production database migration 058

- Migration `058_server_verified_onboarding` was applied to the live Supabase project on 2026-10-15 and is recorded as version `20261015014615`.
- A post-application privilege query confirmed both new onboarding RPCs are executable by `service_role`, and not by `anon` or `authenticated`.
- The conditional revoke of the legacy delegated-onboarding function was safe against the live schema, where that function was absent.
- This is a production schema change, not proof of end-to-end correctness. A proposed synthetic-user create/accept/cleanup test was blocked by the SQL tool's safety checks and did not run. No claim is made that onboarding behavior, cleanup, tenant isolation, or invitation acceptance has passed against a database.
- Supabase security advisor returned one INFO finding: `organization_invitations` has RLS enabled without direct client policies. This is compatible with a server-only access design, but the intended server-only grants and SECURITY DEFINER path must remain documented and tested.

### Test/code mismatch still blocking release

- `test/v2-self-service-onboarding.test.mjs` still calls the legacy browser RPCs `create_organization`, `create_delegated_organization_with_owner_invitation`, and `accept_organization_invitation`. Migration 058 is designed to remove browser execution of these operations and the client now uses `/api/onboarding/*`. The existing integration test is therefore stale relative to the new server boundary and is not a valid verification of the current onboarding flow.
- `test/onboarding-server-boundary.test.mjs` contains static source assertions only. It does not execute Express handlers or validate database transactions.
- The legacy integration suite explicitly requires an isolated disposable Supabase project through `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and `SUPABASE_TEST_SERVICE_ROLE_KEY`; production credentials are intentionally not accepted. No isolated project credentials have been verified/configured in this work session.
- The earlier “not performed” statement in section 5 is superseded: migration 058 was applied to production as recorded above. The merge decision remains unchanged.

### Decision

**PR #35 remains NOT READY TO MERGE.** The server starts on the validation service, but behavioral onboarding tests, tenant-isolation tests, Ellie evidence-learning tests, dependency-direction checks, server/client typechecks, client build, and exact dependency vulnerability analysis are not verified. The next release blocker is to align the stale self-service integration suite with the server API and obtain an isolated test database, then get executable test evidence from a working runner or another approved execution environment. Do not treat the Render startup check as a substitute for those gates.
