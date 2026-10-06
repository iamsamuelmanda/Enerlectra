# ENERLECTRA REACHABILITY AND CAPABILITY BOUNDARY
## 2026-10-06 — reconstruction/platform-identity-boundary

## Purpose

This document records the reachability pass performed against branch
`183c7f65ff42f498679c28733064ceca0313c27f`.

The purpose is to distinguish:

- canonical runtime dependencies;
- legacy capabilities that remain intentionally reachable;
- repository/build dependencies that are not active product runtime;
- capabilities that can eventually be retired.

No deletion is authorized by this document alone.

---

## 1. Canonical production web runtime

The active root entrypoint is:

`server/src/index.ts`

It creates the canonical Supabase client from:

- `V2_SUPABASE_URL`
- `V2_SUPABASE_ANON_KEY`
- `V2_SUPABASE_SERVICE_ROLE_KEY`

It mounts only:

- `/api/operational-issues`
- `/api/actions`
- `/api/operations`
- `/api/organization/context`
- `/api/resources`
- `/api/verifications`

The legacy cluster, staking, ledger, marketplace, settlement, matching and PCU route surfaces are not mounted by this composition root.

The WhatsApp endpoint intentionally fails closed until canonical channel identity resolution is implemented.

### Result

**Canonical web runtime → V2 platform:** CONFIRMED.

No legacy domain route is currently part of the active composition root.

---

## 2. Active browser runtime

The active client router exposes only:

- `/`
- `/signin`
- `/onboarding`
- `/workspace`

The active pages use the V2 API/Supabase path.

Legacy V1 pages and components remain in the repository, including cluster, wallet, trading and transaction surfaces, but they are not exposed by the active router.

### Result

**Active browser route surface → V2 platform:** CONFIRMED.

Legacy frontend remains repository surface and should be retired only after dependency/build/review checks.

---

## 3. Root package dependency boundary

Root `package.json` still declares:

`"enerlectra-core": "file:./enerlectra-core"`

This means `npm ci` installs the legacy core even though the canonical `server/src/index.ts` does not import it.

The root server TypeScript configuration also includes:

`enerlectra-core/src/**/*.ts`

However, the CI server typecheck configuration explicitly excludes `enerlectra-core/**`.

### Interpretation

This is **not evidence that the legacy core is an active web runtime dependency**.

It is evidence that repository/build configuration still treats the legacy core as part of the root project.

This must be resolved deliberately rather than by deletion.

---

## 4. Separate bot runtime

`integrations/enerlectra-bot` is a separate runtime and explicitly depends on:

`enerlectra-core: file:../../enerlectra-core`

Its `src/bot.ts` imports substantial legacy capabilities, including:

- identity/user resolution;
- cluster resolution;
- Redis state;
- OCR;
- reading validation;
- tariff calculation;
- settlement/Lenco payout;
- PCU minting/transfer;
- legacy command handlers;
- Telegram adapter;
- legacy organization/operator views.

### Result

**Legacy core → Telegram/Ellie runtime:** CURRENTLY REACHABLE.

This is not dead code.

It is an intentionally isolated legacy capability runtime, but its authorization and persistence model must not be mistaken for the canonical V2 web model.

---

## 5. Deployment boundary

The current Render configuration still describes two services:

1. legacy Ellie bot under the bot directory;
2. canonical backend service.

The canonical backend has V2 Supabase variables and manual cutover protection.

The bot remains a separate legacy runtime.

The backend deployment is not yet the production cutover.

### Result

**Production deployment still has a legacy capability runtime:** CONFIRMED.

This is acceptable while the bot is intentionally isolated.

---

## 6. Capability classification

| Capability | Current reachability | Classification | Required action |
|---|---|---|---|
| Tenant / identity / membership | V2 runtime | KEEP | Canonical |
| Customer / site / asset | V2 runtime | KEEP | Canonical |
| Observation / Event / Situation | V2 runtime | KEEP | Canonical |
| Recommendation | V2 runtime | KEEP | Canonical |
| Work / Action / Attempt | V2 runtime | KEEP | Canonical |
| Verification / Audit | V2 runtime | KEEP | Canonical |
| Operating context / capabilities | V2 runtime | KEEP | Canonical |
| Meter validation | Legacy bot/legacy services | ADAPT | Preserve algorithm; V2 context |
| OCR | Legacy bot/core | ADAPT | Preserve engine; canonical resource/actor boundary |
| Fraud/image fingerprinting | Legacy capability | ADAPT | Preserve if pilot workflow requires it |
| Tariff/economic calculation | Legacy capability | ADAPT | Preserve bounded calculation logic |
| Payment/Lenco integration | Legacy capability | ADAPT | Re-enter through canonical Action/financial capability boundary |
| Webhook signature/freshness/idempotency | Legacy capability | ADAPT | Preserve security logic; replace persistence/tenant resolution |
| Settlement | Legacy bot/core | ISOLATE | Do not make canonical until product role is validated |
| PCU / wallet | Legacy bot/core | ISOLATE | Do not reintroduce into operational kernel |
| Marketplace / matching / trading | Legacy core | ISOLATE | No canonical dependency |
| Staking / ownership economics | Legacy core | ISOLATE | No canonical dependency |
| Cluster domain | Legacy core | ISOLATE | Replace with organization/resource model when needed |
| Legacy V1 client | Repository surface | RETIRE after checks | Do not repoint at V2 |
| Root `enerlectra-core` dependency | Build/config dependency | ADAPT/RETIRE | Remove only after root build/typecheck reachability is proven |
| Telegram/Ellie runtime | Separate runtime | ISOLATE/ADAPT | Keep bounded; migrate capabilities individually |
| Legacy webhook routes | Not mounted by canonical server | ISOLATE | Preserve until replacement adapters exist |

---

## 7. Important stale configuration found

`vercel.json` still contains a CSP `connect-src` entry for:

`https://enerlectra-backend.onrender.com`

That hostname belongs to the retired/previous backend surface.

This does not make the V2 architecture wrong, but it is stale deployment configuration and should be corrected as part of deployment convergence rather than ignored.

---

## 8. Current decision

The repository is **architecturally converged but not repository-minimal**.

The correct next move is not wholesale legacy deletion.

The next engineering gates are:

1. remove or replace stale deployment references;
2. prove root-package reachability of `enerlectra-core`;
3. separate legacy capability code from legacy identity/persistence assumptions;
4. create bounded canonical adapters for capabilities justified by pilot workflows;
5. retire unreachable V1 browser and server surfaces;
6. validate the complete V2 console lifecycle against the existing Action/Attempt backend.

The key invariant remains:

**One Enerlectra platform. One canonical identity/tenant boundary. One operational kernel. Legacy capabilities survive only behind controlled boundaries until adapted or retired.**

No EPC/PAYGo product split is introduced by this classification.
