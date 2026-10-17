# Enerlectra — Codebase Evidence Reclassification
**Status:** Active architecture authority
**Date:** 2026-10-07
**Applies to:** the entire repository, including `enerlectra-core`

## Decision

The repository is no longer classified by age, historical version, or technical sophistication.

Every subsystem is classified by whether it earns a place in the current product boundary.

The classes are:
- **CORE** — defines the canonical operational platform.
- **CAPABILITY** — bounded operational ability justified by an evidence-backed job.
- **INFRASTRUCTURE** — platform plumbing required to operate the product.
- **FUTURE** — useful historical capability with no current ICP mandate.
- **EXPERIMENTAL** — bounded hypothesis under explicit validation.
- **UNJUSTIFIED** — no current customer job or legitimate platform role.

"Future" and "Unjustified" do not mean "delete immediately". They mean the subsystem must not influence current product architecture.

## Subsystem map

| Repository subsystem | Class | Disposition | Evidence / reason |
|---|---|---|---|
| `server/src/platform/tenant/*` | CORE | Active canonical boundary | Every customer workflow requires actor → membership → organization authorization |
| Organization/operating context | CORE | Active | Mixed operating models require configuration without product forks |
| Customer/site/asset resources | CORE | Active | Customer discovery repeatedly identifies these resources as the missing operational context |
| Observation/event/evidence | CORE | Active | The operational job starts with a signal and requires authoritative evidence |
| Situations | CORE | Active | Exceptions must become bounded cases rather than free-form messages |
| Recommendations | CORE | Active | Operators need bounded, explainable next steps |
| Work items | CORE | Active | Field/service/support coordination is a repeated customer job |
| Actions/attempts | CORE | Active | Execution must be authorized, idempotent and auditable |
| Verification | CORE | Active | Customer outcomes must be proven before cases close or knowledge is promoted |
| Audit | CORE | Active | Operational accountability and learning provenance require it |
| Ellie context/inference | CORE | Active intelligence layer | Customers need operational understanding, not a generic chatbot |
| Ellie learning/memory | CORE | Active intelligence capability | Repeated verified outcomes are useful organizational knowledge |
| Customer support | CAPABILITY | Prioritize | DS Solar/Solar Move evidence shows fragmented customer support and issue routing |
| Maintenance/field service | CAPABILITY | Prioritize | DS Solar and Solar Move evidence shows faults, visits, technicians and warranty work |
| Payment evidence/reconciliation | CAPABILITY | Prioritize | Renwasol and Solar Move evidence shows payment verification, token failures and collections |
| Lenco/mobile-money | CAPABILITY | Integrate behind payment boundary | Existing real integration plus payment workflow relevance |
| Meter observations/reading validation | CAPABILITY | Adapt | Existing real measurement logic is useful evidence infrastructure; it is not the product by itself |
| Meter OCR | CAPABILITY | Adapt | Reduces manual data capture where measurement workflows require it |
| Production/telemetry verification | CAPABILITY | Adapt | Useful evidence source for asset/service workflows |
| Fraud/image fingerprinting | CAPABILITY | Adapt | Useful when a real operational workflow needs evidence-quality controls |
| Inventory | CAPABILITY | Prioritize | Solar Move/MK Energy evidence identifies spreadsheet inventory and reconciliation pain |
| Collections | CAPABILITY | Prioritize | Solar Move evidence identifies manual payment follow-up |
| Supplier workflows | CAPABILITY | Attach when workflow evidence requires them | Supplier escalation is part of some operational cases |
| Communication adapters | CAPABILITY | Attach to workflows | Customer/vendor communication is part of resolution |
| Command/event/workflow infrastructure | INFRASTRUCTURE | Keep/adapt | Enables bounded operational orchestration |
| Channel identity adapters | INFRASTRUCTURE | Keep/adapt | WhatsApp/other channels must resolve to canonical actors |
| Observability/metrics/logging | INFRASTRUCTURE | Keep | Required for production reliability and auditability |
| Supabase/Render/Vercel | INFRASTRUCTURE | Keep | Runtime/deployment substrate |
| `enerlectra-core/src/domain/payment/*` | CAPABILITY | Extract bounded operational payment logic | Payment evidence is customer-relevant; universal financial domain is not current core |
| `enerlectra-core/src/domain/marketplace/*` | FUTURE | Isolate | No current ICP workflow requires energy marketplace matching |
| `enerlectra-core/src/domain/staking/*` | FUTURE | Isolate | No current ICP workflow requires staking |
| PCU/token economy | FUTURE | Isolate | Historical product model; not demonstrated by current B2B operator evidence |
| Cluster economics | FUTURE | Isolate | Does not emerge from current operational workflows |
| Ownership-share economics | FUTURE | Isolate | Not required by current operator ICP |
| Legacy settlement lifecycle | FUTURE | Isolate | Payment reconciliation is needed; universal settlement is not |
| Blockchain settlement | FUTURE | Isolate | No current operational job justifies protocol complexity |
| Treasury | FUTURE | Isolate | Not required to resolve the observed customer operational jobs |
| Energy wallets | FUTURE | Isolate | Not current ICP requirement |
| Energy trading | FUTURE | Isolate | No current discovery evidence |
| Legacy universal ledger | FUTURE | Isolate | Do not let financial protocol architecture define the operational kernel |
| Proactive/semantic intelligence | EXPERIMENTAL | Bound and validate | Potentially valuable, but must prove operational usefulness |
| Autonomous channel operation | EXPERIMENTAL | Fail closed until canonical identity is complete | High-risk without tenant/authority proof |
| Duplicate Supabase clients/configuration | UNJUSTIFIED | Retire | Creates competing authority/configuration paths |
| `V2_*` runtime environment names | UNJUSTIFIED | Retire | Enerlectra is one platform; runtime config must not encode a product version |
| Default organization fallbacks | UNJUSTIFIED | Retire | Violates tenant isolation |
| Legacy protocol routes in active composition | UNJUSTIFIED | Retire from runtime | Not part of current product boundary |
| Duplicate capability implementations | UNJUSTIFIED | Consolidate | One canonical implementation per capability |

## Dependency rule

A FUTURE subsystem may remain imported only where all of the following are true:
1. the import is isolated;
2. it cannot alter canonical tenant resolution;
3. it cannot register active runtime routes/jobs;
4. it cannot influence Ellie authoritative context;
5. it is covered by an explicit future/compatibility boundary.

A FUTURE subsystem must not be reachable through the active product composition merely because another legacy module imports it.

## Canonical dependency direction

```
tenant authority
    ↓
canonical resources
    ↓
evidence/events
    ↓
situations
    ↓
recommendations
    ↓
work
    ↓
actions
    ↓
verification
    ↓
audit + learning

capabilities attach to the resource/work/evidence layers.
historical economic/protocol domains attach only through bounded future capability seams.
```

## Review rule

Before promoting any subsystem, document:
- customer evidence;
- user;
- operational job;
- canonical resource;
- required permissions;
- evidence source;
- verification mechanism;
- failure/rollback behavior;
- why the capability is more useful than merely technically impressive.

This is now the repository's scope-control mechanism.
