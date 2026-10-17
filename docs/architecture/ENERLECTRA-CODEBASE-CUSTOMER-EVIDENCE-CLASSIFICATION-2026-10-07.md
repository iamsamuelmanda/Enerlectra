# Enerlectra Codebase Customer-Evidence Reclassification — 2026-10-07

**Status:** Governing disposition for the reconstruction. This replaces historical KEEP/ADAPT language where it conflicts with customer-evidence scope.

## Classification

- **CORE** — required for the operational kernel or directly evidenced primary job.
- **CAPABILITY** — bounded operational ability justified by current ICP evidence; not part of the kernel.
- **INFRASTRUCTURE** — reusable platform mechanism with no independent product claim.
- **FUTURE** — technically real but not justified by the current ICP.
- **EXPERIMENTAL** — retained only as isolated research/prototype surface.
- **UNJUSTIFIED** — no current customer-evidence case; should not influence architecture and should be removed when safely possible.

## Current codebase inventory

| Area / representative paths | Disposition | Evidence / reason | Architectural rule |
|---|---|---|---|
| `server/src/platform/tenant/*` | CORE | Every customer workflow requires tenant-safe identity and authorization | Single canonical resolver |
| `server/src/services/actions.ts`, `server/src/routes/actions.ts` | CORE | Consequential work needs bounded action/attempt semantics | No alternate client or tenant path |
| Observation/Event/Situation/Work/Verification migrations and services | CORE | Directly implements the repeated operational loop | Lifecycle semantics remain platform-defined |
| `server/src/routes/ellie.ts` + `server/src/platform/intelligence/*` | CORE | Customer evidence supports an operational-intelligence layer | Tenant-scoped, evidence-backed, non-authoritative |
| `enerlectra-core/src/ai/ellie.ts` | INFRASTRUCTURE / CORE INTELLIGENCE | AI reasoning is useful only as a bounded intelligence layer | Never owns authorization or canonical truth |
| OCR / meter-reading validation (`enerlectra-core/src/core/services/ocr.ts`, validation/readings paths) | CAPABILITY | Reading capture/validation is evidenced as operational input and useful infrastructure | Feed canonical evidence; do not define the product |
| Fraud/image fingerprinting | CAPABILITY | Useful where evidence quality, anomaly detection or disputes require it | Evidence/verification capability only |
| Production verification | CAPABILITY | Verification is a core operational requirement; domain-specific verification is a capability | Must terminate in canonical Verification |
| WhatsApp/channel adapters and communication infrastructure | CAPABILITY + INFRASTRUCTURE | Discovery repeatedly shows WhatsApp/phone/manual communication as a real workflow surface | Resolve channel → actor → membership; never trust channel tenant claims |
| Lenco/mobile-money adapters and payment evidence | CAPABILITY / HIGH | Renwasol and payment/token exception evidence | Payment remains bounded capability; reconciliation outcomes must be verifiable |
| Customer/site/asset records | CORE | Explicitly required to identify who/where/what during issue resolution | Canonical tenant-owned resources |
| Maintenance / field-service workflow | CAPABILITY / HIGH | DS Solar and Solar Move evidence | Use Work/Action/Verification; no parallel workflow kernel |
| Customer support / communications | CAPABILITY / HIGH | Customer fault intake and follow-up are repeatedly evidenced | Communication is evidence/work, not a second tenant model |
| Inventory | CAPABILITY / HIGH | Solar Move and MK Energy rely on Excel/manual inventory | Add only bounded inventory semantics; integrate with Work |
| Supplier workflow | CAPABILITY | Vendor escalation and external dependencies recur in operations | Supplier is a resource/capability, not a new product |
| Tariff/economic calculations | CAPABILITY when workflow requires | Some operational/payment calculations are useful, but generic economic engines are not the product | No authority from calculations alone |
| `server/src/services/settlement*`, `enerlectra-core/src/domain/settlement*` | FUTURE / bounded financial capability | Historical settlement architecture is broader than current evidence | Isolate; no kernel dependency |
| `server/src/services/ledger*`, `enerlectra-core/src/domain/ledger*` | FUTURE / bounded financial capability | Generic financial ledger is not an ICP-defined operational job | Isolate; introduce only for a validated workflow |
| `server/src/services/pcuMinting.ts`, PCU transfer/domain | FUTURE | No current ICP evidence requires PCU economics | No kernel influence |
| `server/src/routes/staking.ts`, staking services | FUTURE | No current ICP evidence requires staking | No kernel influence |
| Marketplace domain/engines/schema | FUTURE | Energy marketplace/matching is not the strongest current customer job | No kernel dependency |
| Matching engines | FUTURE | Matching belongs to future marketplace workflows | Keep isolated |
| Cluster economics / ownership / contribution ledgers | FUTURE | Early product concept, not current operational-intelligence evidence | No kernel dependency |
| Treasury/blockchain/energy-trading contracts | EXPERIMENTAL / FUTURE | Protocol/economic experimentation, not current ICP core | Isolated from runtime kernel |
| Legacy wallet/balance/cluster dashboards | FUTURE / EXPERIMENTAL | Reflect historical product model | Must not shape canonical workspace or tenant model |
| Backup files / historical Replit artifacts | UNJUSTIFIED for runtime | Historical recovery material only | Never imported into runtime architecture |

## High-priority capability sequence

1. customer issue intake/routing;
2. maintenance + field service;
3. payment/token exception reconciliation;
4. customer communication/support;
5. inventory;
6. supplier workflows;
7. reading/OCR/validation;
8. deeper monitoring/integration adapters.

## Evidence test for future changes

Every new subsystem must record:

1. customer problem;
2. user/role;
3. discovery evidence;
4. operational job;
5. canonical resource(s);
6. kernel vs capability placement;
7. authorization/data-model impact;
8. verification/outcome;
9. why it improves usefulness rather than technical novelty.

## Convergence rule

Historical code is not automatically preserved merely because it is reusable. It is retained when its customer-evidence disposition is CORE, CAPABILITY, INFRASTRUCTURE, FUTURE or EXPERIMENTAL with a deliberate isolation boundary. UNJUSTIFIED runtime influence is removed.

Do not perform blanket deletion merely to make the repository smaller. The goal is architectural honesty: current runtime behavior should depend only on the current product boundary.