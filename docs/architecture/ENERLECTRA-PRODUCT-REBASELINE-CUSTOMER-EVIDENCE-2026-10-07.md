# Enerlectra Product Rebaseline — Customer Evidence to Operational Kernel

**Date:** 2026-10-07  
**Status:** Governing product-boundary document for the reconstruction

## 1. Product definition

Enerlectra is **operational intelligence infrastructure for energy-facing businesses**.

It is one multi-tenant platform. EPC, PAYGo, mini-grid, C&I, distributor, maintenance, EaaS and mixed operating models are configurations/capabilities, not separate products.

> A capability earns its place when it helps an energy-facing organization perform a real operational job, uses authoritative evidence inside the canonical tenant boundary, and produces a verifiable outcome.

## 2. Customer evidence

The strongest on-target discovery evidence comes from DS Solar, Renwasol and Solar Move Africa.

Recurring signals:
- fragmented customer, payment, support and monitoring records;
- WhatsApp, phone calls, Excel and separate monitoring/payment tools;
- customer fault intake and routing;
- payment/token exceptions and reconciliation;
- maintenance and field work;
- customer communication and follow-up;
- inventory and collections administration;
- manual coordination and weak operational visibility.

The boarding-house discovery remains useful historical evidence but is not the primary ICP for the current B2B energy-operator product.

## 3. Evidence → operational job → capability → canonical domain → intelligence

| Customer signal | Operational job | Required capability | Canonical domain | Intelligence requirement | Disposition |
|---|---|---|---|---|---|
| Customer reports a fault | Identify and resolve the issue | Issue intake, customer/site/asset context | Situation, Customer, Site, Asset, Work, Action, Verification | Prioritize, diagnose, route, learn | CORE |
| Payment made but service/token fails | Reconcile and restore service | Payment evidence/reconciliation, customer support | Evidence, Situation, Work, Verification + payment capability | Detect exceptions, correlate payment→service, explain next step | CAPABILITY / HIGH |
| Repeated inverter/battery faults | Diagnose and perform maintenance | Maintenance/field service | Asset, Situation, Work, Action, Verification | Recognize recurrence and suggest bounded response | CAPABILITY / HIGH |
| Manual customer follow-up | Resolve support backlog | Customer support/communications | Customer, Situation, Communication, Work | Summarize unresolved work and propose contact | CAPABILITY / HIGH |
| Inventory in Excel | Know stock available for work | Inventory | Resource/Work + inventory capability | Compare demand, stock and history | CAPABILITY / HIGH |
| Technician coordination | Assign and execute field work | Field service/responsibility | Work, Action, Verification | Match work to responsibility and history | CAPABILITY / HIGH |
| Supplier escalation | Coordinate external dependency | Supplier workflow | Supplier, Work, Communication | Track dependency and escalation | CAPABILITY |
| Meter/OCR/manual readings | Capture trustworthy operational evidence | Reading/OCR/validation | Observation/Evidence | Validate readings and detect anomalies | CAPABILITY |
| Payment/mobile-money integration | Receive/trace money movement | Lenco/mobile-money adapters | Payment capability, Evidence, Verification | Reconcile exceptions and prove outcome | CAPABILITY |
| Marketplace/matching | Trade or match energy | Marketplace | Future capability | Only if future customer evidence proves the job | FUTURE |
| Staking | Financial incentive/protocol economics | Staking | Future/experimental | No current ICP requirement | FUTURE |
| PCU/token economy | Energy credit/economic protocol | PCU/token capability | Future/experimental | No current ICP requirement | FUTURE |
| Blockchain settlement | Protocol settlement | Blockchain settlement | Future/experimental | No current ICP requirement | FUTURE |
| Cluster economics | Shared ownership/economics | Cluster economics | Future | No current ICP requirement | FUTURE |
| Universal financial ledger | Generic financial system | Ledger/treasury | Future / bounded financial capability | Must be justified by a specific operational workflow | FUTURE |

## 4. Canonical operational loop

The primary operational loop is:

`signal → identify resource → investigate → decide → assign → act → capture evidence → verify → learn`

Payment/token exceptions and maintenance are instances of the same loop.

## 5. Kernel boundary

The operational kernel owns stable semantics:

`identity → actor → membership → organization → operating context → resource → evidence/event → situation → recommendation → work → action → verification → audit`

Capabilities plug into the kernel. They do not redefine tenancy, authorization, lifecycle semantics or verification.

## 6. Intelligence boundary

Ellie consumes canonical records, operational evidence/history, procedures, policies, validated patterns, preferences and verified outcomes.

Ellie may recommend and propose bounded work. Canonical authorization, Action, Attempt and Verification remain authoritative.

## 7. What this document prohibits

- new product silos for EPC/PAYGo/mini-grid/etc.;
- capability inclusion merely because old code exists;
- LLM-owned business truth;
- cross-tenant organizational learning;
- autonomous authorization hidden inside prompts;
- reintroducing marketplace/staking/PCU/settlement as kernel concepts without customer evidence.

## 8. Decision rule

When a proposed capability cannot answer **who needs it, what operational job it performs, what evidence supports it, what canonical resource it operates on, and how its outcome is verified**, it does not belong in the current core.