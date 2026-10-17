# Enerlectra Product Evidence → Capability → Architecture Baseline
**Status:** Active architectural/product boundary for PR #35  
**Date:** 2026-10-07

## Decision

Enerlectra is one platform for operational intelligence for energy-facing businesses.

EPC, PAYGo, mini-grid, C&I, distributor, maintenance and EaaS are operating configurations/capabilities inside the same platform. They are not separate Enerlectra products.

The governing test is:

> A capability earns its place when it helps an energy-facing organization perform a real operational job, using authoritative evidence, within the canonical tenant boundary, and produces a verifiable outcome.

Historical implementation is not sufficient justification.

## Customer evidence baseline

The strongest on-target discovery evidence is from DS Solar, Renwasol and Solar Move Africa. The recurring operational jobs are:

| Evidence | Operational job | Required capability | Canonical path | Intelligence requirement |
|---|---|---|---|---|
| Solar Move customer faults, site/equipment confusion, manual coordination | Resolve customer/site/asset issue | Issue intake + resource identity + field coordination | Situation → Work → Action → Verification | Identify affected resource, recurrence and next bounded step |
| Renwasol payment → Primenet → token failure | Resolve payment/token exception | Payment evidence + reconciliation + communication | Evidence → Situation → Work → Verification | Correlate payment, service access and resolution evidence |
| DS Solar inverter/battery faults and warranty work | Diagnose and resolve equipment fault | Asset/service history + field work + warranty workflow | Asset → Situation → Work → Action → Verification | Compare current fault with verified prior outcomes |
| Cross-customer WhatsApp/Excel/phone fragmentation | Maintain operational continuity | Channel identity + evidence capture + unified work queue | Actor → Organization → Evidence → Situation | Surface unresolved exceptions and missing ownership |
| Manual inventory/collections tracking | Know what requires operational attention | Inventory/payment capability | Resource/Evidence → Situation → Work | Detect exceptions, overdue work and recurring failure patterns |

The common loop is:

**signal → identify customer/site/asset → investigate → coordinate → act → capture evidence → verify → learn**

## Codebase disposition

### CORE

These define the canonical product kernel:

- identity, Actor, Membership and Organization;
- tenant resolution and authorization;
- operating context, capabilities and policies;
- customer/site/asset resource model;
- evidence and situation model;
- work items;
- Action lifecycle;
- Action attempts;
- Verification;
- audit/correlation/observability;
- Ellie intelligence context and recommendation boundary.

These are architectural authorities. Legacy modules must not redefine them.

### CAPABILITY

These solve evidenced operational jobs and should converge behind the core:

- operational issue intake and routing;
- maintenance/field service;
- customer support/communications;
- payment reconciliation and payment/token exception handling;
- Lenco/mobile-money integration;
- meter observation/validation;
- OCR;
- fraud/image fingerprinting;
- inventory;
- supplier workflows;
- warranty/service history;
- bounded tariff/economic calculations;
- channel adapters such as WhatsApp.

A capability must consume canonical tenant context and produce canonical evidence/work/verification records.

### INFRASTRUCTURE

Reusable technical substrate that enables the above without defining the product:

- workflow/event infrastructure;
- command contracts/routing;
- correlation/causation;
- communication primitives;
- telemetry/metrics/logging;
- external integration adapters;
- shared execution context;
- deployment/runtime infrastructure.

Infrastructure has no product authority of its own.

### FUTURE

Retained outside the current operational kernel until customer evidence justifies a bounded capability:

- marketplace;
- energy trading;
- staking;
- blockchain settlement;
- PCU/token economy;
- energy wallets;
- cluster economics;
- ownership shares;
- treasury/settlement networks;
- universal financial ledger/settlement lifecycle.

These may contain valuable algorithms/IP. Their presence in the repository must not cause current product architecture, authorization, tenancy or UX to depend on them.

### EXPERIMENTAL

Prototype or research implementations whose value has not yet been demonstrated against the ICP. They may be tested in isolation but cannot become canonical authorities without evidence.

### UNJUSTIFIED

Any subsystem that cannot answer all of:

1. Which evidenced customer problem does it solve?
2. Which operational job does it support?
3. Which canonical resource/evidence does it operate on?
4. What verifiable outcome does it produce?
5. Why is it needed now rather than merely technically interesting?

Unjustified code is not automatically deleted. It is prevented from influencing the current architecture and is a candidate for retirement after dependency analysis.

## Old-system rule

Do not ask whether old code can be technically reused.

Ask whether the customer-evidence test says it deserves to survive.

Reuse an algorithm or integration when valuable; do not inherit its old tenant model, authorization model, product assumptions or database authority.

## Canonical architecture

```
Actor
 → Membership
 → Organization
 → Operating Context
 → Capability + Policy + Responsibility Scope
 → Resource
 → Evidence / Event
 → Situation
 → Recommendation
 → Work
 → Action
 → Verification
 → Audit
```

Ellie is intelligence over this graph. Ellie is never the authority for authorization or execution.

## Ellie knowledge model

Ellie must distinguish:

- **FACT** — canonical record; retrieve it rather than hallucinate or duplicate it.
- **PROCEDURE** — demonstrated organizational way of working.
- **POLICY** — authoritative organizational rule; system policy remains the source of truth.
- **PATTERN** — repeated, evidence-backed operational relationship.
- **PREFERENCE** — authorized human/organizational preference.
- **OUTCOME** — evidence about a recommendation in a specific case.

A verified recommendation outcome does not automatically become a procedure or pattern.

Pattern promotion is explicit, tenant-scoped and evidence-gated.

## Ellie target state

```
Canonical records
+ Evidence
+ Operational history
+ Procedures
+ Policies
+ Verified outcomes
+ Patterns
+ Preferences
        ↓
Organizational intelligence
        ↓
Ellie
        ↓
Understand → Recommend → Assist
        ↓
Canonical authorization
        ↓
Action → Verification
        ↓
Learning
```

Ellie should learn what the organization has demonstrated, not merely remember what was said.

## Merge implication

PR #35 is not complete merely because the identity boundary compiles.

Before merge, the implementation must demonstrate:

- no canonical runtime dependency on V2 environment aliases;
- no duplicate tenant authority;
- tenant-safe resource retrieval;
- explicit recommendation targeting;
- evidence/reference validation;
- evidence-backed, time-aware memory;
- outcome/pattern separation;
- executable exact-head validation;
- browser auth → onboarding → workspace → Action/Attempt/Verification proof;
- security disposition.

This document supersedes any earlier assumption that historical Enerlectra subsystems automatically deserve preservation in the current architecture.
