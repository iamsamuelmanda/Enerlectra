# Validation Slice — EPC

## 1. Purpose

Define one representative EPC workflow used to validate Enerlectra's shared operational kernel. This slice is a validation case, not an EPC-specific product boundary.

Source contracts:
- `docs/v2/V2-Domain-and-Tenancy-Blueprint.md`
- `docs/v2/V2-Domain-to-Schema-Design.md`
- `docs/v2/V2-RLS-Tenant-Isolation-and-Attack-Model.md`

This is a contract, not an implementation plan for the full EPC market.

## 2. Organization profile

Representative operating model:

**EPC / solar installer**

The organization may install, commission, warranty, and service distributed-energy systems.

Business-model classification is configuration/context, not authorization.

## 3. Enabled capabilities

Initial EPC capability profile:
- customer management;
- site management;
- asset management;
- installation/project delivery;
- commissioning;
- warranty/service;
- field work;
- operational incident management;
- evidence capture;
- communication.

Not required for this slice:
- PAYGo collections;
- prepaid energy management;
- P2P energy trading;
- PCUs;
- staking;
- cluster governance;
- marketplace;
- full procurement;
- full project-management suite.

## 4. Initial roles

The slice should support only the authority required to complete the workflow:

### Operations manager
- view organization operational data;
- review situations;
- create/assign work;
- approve consequential operational actions.

### Operator/support
- create/read operational evidence;
- create or update situations within assigned scope;
- view relevant customer/site/asset context;
- propose or initiate permitted work.

### Field technician
- view assigned work;
- record observations/actions;
- attach evidence;
- submit outcome for verification.

### Read-only/auditor
- view permitted records;
- cannot change operational state.

Exact permission names remain implementation detail.

## 5. Workflow

### Problem

**Delayed installation or reported asset fault → evidence → event → situation → recommendation → work item → verification.**

Example:

> A customer reports that the installed solar system is not functioning.

### State flow

```
INPUT
  ↓
Observation
  ↓
Event
  ↓
Situation
  ↓
Recommendation
  ↓
Authorized Work Item
  ↓
Action / Work Evidence
  ↓
Verification
  ↓
Resolved OR Reopened
```

## 6. Step-by-step contract

### Step 1 — Input

Possible initial input:
- operator report;
- customer communication;
- technician observation;
- manual entry;
- approved integration event.

Minimum context:
- actor;
- organization;
- customer where known;
- site where known;
- asset where known;
- source/channel;
- timestamp;
- evidence.

### Step 2 — Observation

Record what was actually observed.

Examples:
- inverter not producing;
- installation milestone delayed;
- battery fault indicator observed;
- customer reports loss of service.

Observation is evidence, not diagnosis.

### Step 3 — Event

Normalize the meaningful occurrence.

Candidate event types:
- `ASSET_FAULT_REPORTED`
- `INSTALLATION_DELAYED`
- `SERVICE_ISSUE_REPORTED`

Event must retain:
- organization;
- actor/source;
- timestamp;
- correlation/causation where applicable;
- subject reference;
- evidence reference.

### Step 4 — Situation

Create/update an operational interpretation.

Example:

> “Customer site has a reported inverter fault requiring field investigation.”

A situation may aggregate multiple pieces of evidence and events.

A situation is not simply an alert.

### Step 5 — Recommendation

Ellie/system produces a bounded recommendation based on authorized evidence.

Example:

> Review recent asset history and assign a technician to inspect the inverter and DC connections.

Recommendation is:
- derived;
- explainable from available evidence;
- non-authoritative;
- not automatically executed.

### Step 6 — Authorization

An appropriately authorized operations user accepts, modifies, or rejects the recommendation.

The system must record:
- actor;
- organization;
- recommendation;
- decision;
- timestamp;
- correlation ID.

### Step 7 — Work item

Create a cluster-independent work item.

Minimum fields conceptually:
- organization;
- situation;
- assignee/team;
- status;
- priority;
- due target;
- description;
- evidence links.

### Step 8 — Action / evidence

Technician records:
- what was inspected;
- what was changed;
- new observations;
- supporting evidence;
- result.

Consequential changes require appropriate authorization.

### Step 9 — Verification

A separate verification step determines whether the intended operational outcome occurred.

Example:

> Inverter output restored and confirmed by follow-up observation.

Possible result:
- verified resolved;
- partially resolved;
- unresolved;
- reopened/escalated.

The situation must not be considered successfully resolved merely because work was marked complete.

## 7. Inputs and outputs

### Inputs
- authenticated actor;
- organization membership;
- customer/site/asset context;
- operational evidence;
- event source;
- technician/manager observations.

### Outputs
- normalized event;
- situation;
- evidence-linked recommendation;
- authorized work item;
- work evidence;
- verification;
- audit trail.

## 8. Authorization points

Authorization is required at:
1. tenant context resolution;
2. situation/work access;
3. assignment where restricted;
4. consequential operational action;
5. verification/closure where organizational policy requires independent confirmation.

Ellie cannot bypass authorization.

## 9. Evidence and audit requirements

Evidence:
- records what happened or was observed;
- remains traceable;
- is organization-scoped.

Audit:
- records who performed or authorized consequential operations;
- is not a replacement for operational evidence.

At minimum retain:
- actor;
- organization;
- event/situation/work reference;
- action;
- timestamp;
- decision/outcome;
- correlation/causation where applicable.

## 10. Success metrics

Pilot measurement should include:
- time from issue report to assignment;
- time from assignment to verified resolution;
- percentage of work items closed with verification;
- number of unresolved/delayed jobs visible to management;
- repeat fault rate;
- technician follow-up time;
- number of cases requiring repeated customer contact.

Baseline values must be measured rather than invented.

## 11. Explicit exclusions

Do not build in this slice:
- procurement marketplace;
- installer bidding;
- cluster management;
- ownership shares;
- PCUs;
- energy wallets;
- P2P energy trading;
- staking;
- blockchain settlement;
- full accounting;
- automated remote control;
- generalized no-code workflows;
- comprehensive ERP/project management.

## 12. Assumptions

- EPC organizations have customers, sites, and distributed-energy assets.
- Operational work can be represented without cluster-specific concepts.
- At least one staff member can provide/verify operational evidence.
- Asset telemetry is not required for the first slice.

## 13. Unknowns

- Exact EPC terminology used by each pilot.
- Whether installations and post-installation service should share one work primitive.
- Which asset types are most important initially.
- Required photo/document evidence.
- Whether verification must always be performed by a different person.
- Which external systems, if any, should provide installation or fault events.

## 14. Customer validation questions

- What are the most frequent installation/service exceptions?
- How are faults currently reported?
- What information does an operator need before dispatching a technician?
- Who decides whether a technician is dispatched?
- What evidence proves a fault was resolved?
- Which cases are repeatedly reopened?
- How is responsibility assigned today?
- Which operational information is currently spread across WhatsApp, spreadsheets, calls, or separate systems?
- What would make the workflow measurably faster or less error-prone?

## 15. Minimum data required

- organization;
- actor/membership;
- customer;
- site;
- asset;
- observation;
- event;
- situation;
- recommendation;
- work item;
- work evidence;
- verification;
- audit record.

## 16. Schema implications

The EPC slice validates the minimum need for:
- customers;
- sites;
- assets;
- observations;
- events;
- situations;
- situation evidence;
- assignments;
- recommendations;
- work items;
- work evidence;
- verifications;
- audit records;
- strict organization scoping across all of them.

No EPC-specific parallel versions of the core primitives are required.


## 17. Market-scope interpretation

EPC is one validation case, not Enerlectra's ICP definition. The same organization may operate installation, maintenance, financing, energy services, distribution, or other activities simultaneously.

The slice proves only that an installation/service-oriented workflow can traverse the shared kernel. It does not prescribe that every customer must enable the EPC capability set above.

The active product question remains:

> Which operational capabilities does this organization actually need, and how can Enerlectra turn its evidence into useful decisions, work, actions, and verified outcomes?

A different energy-facing business may therefore arrive with a materially different capability set while using the same Customer, Site, Asset, Observation, Event, Situation, Recommendation, Work, Action, and Verification primitives.
