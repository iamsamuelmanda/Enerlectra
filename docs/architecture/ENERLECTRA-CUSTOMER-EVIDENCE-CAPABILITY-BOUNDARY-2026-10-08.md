# Enerlectra Customer-Evidence Capability Boundary — 2026-10-08

## Purpose

This document is the product/architecture authority for deciding which historical Enerlectra subsystems belong in the current platform.

Enerlectra is **one operational-intelligence platform for energy-facing businesses**. EPC, PAYGo, mini-grid, C&I, distributor, maintenance and EaaS are operating configurations, not separate products.

The governing rule is:

> A capability earns its place when it helps an energy-facing organization perform a real operational job, using authoritative evidence, within the canonical tenant boundary, and produces a verifiable outcome.

Historical implementation existence is not evidence of current product necessity.

## Customer evidence

The strongest current B2B evidence comes from DS Solar, Renwasol and Solar Move Africa. Across those interviews the recurring operational pattern is:

`signal → identify customer/site/asset → investigate → coordinate → act → capture evidence → verify → learn`

Observed jobs include:

- customer fault intake and routing;
- payment/token exception reconciliation;
- maintenance and field-service coordination;
- customer communication;
- inventory and collections tracking;
- fragmented records across WhatsApp, phone calls, spreadsheets, monitoring and payment systems.

These workflows are the current product boundary.

## Classification

### CORE

These form the shared operational kernel and should remain authoritative:

- identity, actor and membership;
- organization and tenant boundary;
- operating context, capabilities and policies;
- customer/site/asset records;
- evidence/events;
- situations/exceptions;
- recommendations;
- work items;
- actions and attempts;
- verification;
- operational audit;
- canonical tenant-scoped authorization;
- Ellie intelligence over canonical operational context.

CORE code must not depend on historical economic/protocol domains for its authority model.

### CAPABILITY

These solve concrete operational jobs and sit beside the kernel:

- payment evidence and reconciliation;
- Lenco/mobile-money integrations;
- maintenance/field-service workflows;
- customer support/communications;
- inventory;
- supplier workflows;
- meter/production validation;
- OCR/document extraction where it improves an operational workflow;
- image/fraud fingerprinting where evidence is required;
- production verification;
- relevant channel adapters such as WhatsApp.

A capability may be expanded only when an actual customer workflow justifies it.

### INFRASTRUCTURE

These support the platform without defining its product identity:

- workflow/event/command infrastructure;
- request/correlation context;
- observability;
- integration adapters;
- shared persistence and security utilities;
- deployment/runtime composition;
- reusable AI transport/inference infrastructure.

Infrastructure must remain subordinate to the canonical operational model.

### FUTURE

These may be valuable later but do not define the current ICP:

- marketplace/matching;
- staking;
- energy wallets;
- PCU/token economy;
- blockchain settlement;
- treasury;
- cluster economics;
- energy trading;
- universal financial/settlement ledger;
- other protocol/economic systems whose primary value is outside the observed operational jobs.

Future code may remain in the repository when technically useful, but it must not shape the canonical kernel, authorization model, tenant boundary or Ellie context.

### EXPERIMENTAL

Research or exploratory implementations without sufficient customer evidence. They must be isolated from canonical runtime influence and clearly documented as experiments.

### UNJUSTIFIED

A subsystem with no defensible current operational job, customer evidence, or infrastructure role. Such code should be retired when safe to do so rather than preserved merely because it is sophisticated.

## Review test for every subsystem

Before promoting historical code into CORE or CAPABILITY, answer:

1. What customer problem does it solve?
2. Who needs it?
3. What evidence demonstrates the need?
4. What operational job does it support?
5. Which canonical resource does it operate on?
6. Is it kernel logic, capability logic, or infrastructure?
7. What authorization/data-model surface does it introduce?
8. Does it improve customer usefulness or merely technical sophistication?
9. Can its outcome be evidenced and verified?
10. Does it preserve one tenant-safe implementation rather than create a parallel product model?

If these questions cannot be answered, the subsystem does not get architectural authority.

## Ellie boundary

Ellie is the tenant-scoped organizational intelligence layer.

Its knowledge model distinguishes:

- **FACT** — canonical database truth;
- **PROCEDURE** — demonstrated organizational way of working;
- **POLICY** — authoritative organizational rule;
- **PATTERN** — explicitly promoted recurring behavior supported by evidence;
- **PREFERENCE** — organizational/user preference;
- **OUTCOME** — evidence about one recommendation or operational instance.

Facts remain in canonical domain tables. Ellie memory is not a replacement database.

A verified recommendation outcome must not automatically become a procedure or pattern. Pattern promotion is an explicit evidence-reviewed operation.

Learning requires provenance, resource scope, validity, contradiction handling and bounded confidence. Expired or retired knowledge must not be treated as current organizational truth.

## Canonical intelligence loop

`Observe → Understand → Remember → Predict → Recommend → Assist → Act → Verify → Learn`

Ellie may recommend and structure intent. It does not authorize, execute or verify its own actions.

The canonical Action/Attempt/Verification boundary remains authoritative.

## Convergence implications

The repository must not reintroduce:

- `V2_*` runtime configuration into canonical paths;
- duplicate tenant resolution;
- duplicate authorization boundaries;
- arbitrary recommendation-to-situation attachment;
- model-generated evidence identifiers that are not validated against supplied canonical context;
- AI memory treated as authoritative business fact;
- historical economic/protocol domains as implicit prerequisites for ordinary operational work.

The desired end state is not deletion of Enerlectra's history. It is **architectural irrelevance of unjustified history**: valuable components remain available when customer evidence earns them, while the current product is governed by the operational-intelligence kernel.

## Merge criterion

Architecture is considered aligned with implementation only when:

- current runtime follows the canonical tenant boundary;
- capability classification is documented and reflected in dependency direction;
- Ellie references only tenant-scoped canonical context;
- recommendation targets are explicit;
- evidence references are validated;
- learning preserves epistemic distinctions;
- memory has validity/provenance/contradiction semantics;
- current migrations are deterministic and internally consistent;
- executable validation is run against the current PR HEAD.

