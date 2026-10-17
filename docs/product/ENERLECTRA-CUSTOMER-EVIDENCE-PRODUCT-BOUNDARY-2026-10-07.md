# Enerlectra — Customer-Evidence Product Boundary
**Status:** Active product/architecture authority
**Date:** 2026-10-07

## Product thesis

Enerlectra is **operational intelligence infrastructure for energy-facing businesses**.

It is one coherent multi-tenant platform. EPC, PAYGo, mini-grid, C&I, distributor, maintenance, EaaS and mixed models are operating contexts/configurations, not separate products.

The product earns a capability only when it helps an energy-facing organization perform a real operational job using authoritative evidence inside the canonical tenant boundary and produces a verifiable outcome.

## Evidence base

The strongest current B2B evidence is the on-target energy-operator discovery from DS Solar, Renwasol and Solar Move Africa.

Recurring evidence:
- fragmented operations across WhatsApp, phone, Excel, monitoring and payment systems;
- customer issue intake and routing;
- payment/token exceptions and payment verification;
- technical faults and maintenance;
- field technician coordination;
- inventory and collections tracking;
- manual customer communication and follow-up;
- operational staff spending time reconstructing the state of a case from disconnected systems.

The evidence therefore points to an operational loop, not a marketplace or protocol loop.

## Canonical operational loop

```
signal / report
  ↓
identify customer / site / asset
  ↓
collect authoritative evidence
  ↓
understand situation
  ↓
recommend / coordinate
  ↓
create work
  ↓
propose action
  ↓
authorize
  ↓
execute / attempt
  ↓
capture evidence
  ↓
verify outcome
  ↓
learn from demonstrated outcome
```

## Customer-evidence → operational job → capability → domain → intelligence

| Evidence | Operational job | Capability | Canonical domain | Intelligence requirement |
|---|---|---|---|---|
| Customer fault reports | Diagnose and route customer issues | Issue intake + customer/site/asset context | Situation → Work | Prioritize, identify related history, recommend next step |
| Renwasol payment/token failures | Restore service after payment exception | Payment evidence + reconciliation + communications | Evidence → Situation → Work → Verification | Connect payment, token, customer and outage evidence |
| DS Solar inverter/battery faults | Diagnose, dispatch, repair/warranty | Maintenance + field service | Asset → Work → Action → Verification | Recognize recurring fault classes and prior resolutions |
| Solar Move manual inventory/collections | Track operational obligations | Inventory + collections workflows | Resource → Work | Surface overdue/unresolved obligations |
| Fragmented WhatsApp/Excel/monitoring | Reconstruct operational state | Operational context + integrations | Evidence/Event/Situation | Build one trustworthy operational picture |
| Technician coordination | Assign and complete field work | Responsibility + work assignment | Work → Action | Match work to authorized responsibility |
| Repeated verified cases | Reduce future investigation effort | Organizational learning | Verification → Memory | Distinguish outcomes from procedures/patterns |

## Capability classes

### CORE

These define the platform:
- identity and authentication;
- actor/membership/organization;
- operating context;
- tenant authorization;
- customer/site/asset resources;
- observations/evidence/events;
- situations;
- recommendations;
- work;
- actions and attempts;
- verification;
- audit;
- organizational intelligence context.

### CAPABILITY

These are bounded operational abilities attached to the core when customer evidence justifies them:
- customer support;
- field service / maintenance;
- payment evidence and reconciliation;
- mobile-money/provider adapters;
- meter observations;
- OCR;
- reading validation;
- production/telemetry verification;
- inventory;
- collections;
- supplier workflows;
- communication adapters;
- fraud/image analysis.

### INFRASTRUCTURE

These enable the product but are not customer-facing product domains:
- Supabase/PostgreSQL;
- Render/Vercel deployment;
- observability/metrics/logging;
- event/correlation infrastructure;
- command/workflow infrastructure;
- channel adapters;
- authenticated request-scoped database access;
- external integration adapters.

### FUTURE

These remain isolated unless new customer evidence creates a concrete operational job:
- marketplace;
- energy trading;
- staking;
- blockchain settlement;
- treasury;
- universal financial ledger;
- PCU/token economy;
- cluster economics;
- ownership-share economics;
- energy wallets.

### EXPERIMENTAL

Allowed only behind bounded seams and explicit validation:
- proactive intelligence;
- semantic/embedding retrieval;
- autonomous channel experiences;
- new integrations without pilot evidence.

### UNJUSTIFIED

Remove from active architecture when there is no current customer job, no authoritative dependency, and no justified experimental purpose:
- duplicate tenant/auth paths;
- versioned runtime configuration;
- default-organization fallbacks;
- legacy protocol routes mounted into the active composition root;
- duplicate implementations of a capability.

## Product boundary rule

A historical subsystem is not promoted because it is technically sophisticated.

It must pass:
1. customer problem;
2. real user;
3. evidence;
4. operational job;
5. canonical resource;
6. bounded authorization;
7. verifiable outcome;
8. measurable usefulness.

## Consequence

The old economic/protocol subsystems are not deleted merely because they are old. They are **architecturally demoted**: they cannot define the tenant model, active runtime, product navigation, intelligence context or authorization model.

Enerlectra is not a collection of historical features. It is one operational platform with evidence-backed capabilities.
