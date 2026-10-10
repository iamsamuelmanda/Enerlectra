# Enerlectra V2 — Customer Operational Issue Workflow

Status: Discovery-derived workflow specification

## 1. Evidence basis

The Solar Move Africa interview with Mary Lengwe Katebe provides a real customer incident rather than a hypothetical workflow.

The incident involved a customer requesting a well pump; customer-provided well-depth information; quotation and dispatch; an equipment-size mismatch; return and replacement; customer-controlled installation; subsequent pump failure; referral to the chief technician; equipment inspection; discovery of a condition affecting responsibility/warranty; a commercial decision to provide another pump at a reduced basis; and restoration of the customer relationship.

The interview also describes repeated faults involving pumps, inverters and batteries, and identifies home-system fault reporting as a significant repetitive operational problem.

Solar Move already has technical monitoring in at least one hospital installation. The interview therefore distinguishes monitoring from the operational problem of receiving, routing, investigating and resolving customer faults.

## 2. Workflow boundary

The first Enerlectra workflow is:

**Customer Operational Issue**

Definition:

> A customer, staff member, monitoring source, or other authorized source reports or produces evidence of an operational problem involving a customer, site, service, or energy asset, and the organization takes the issue through intake, investigation, response, work, evidence capture and verification.

This is an operational workflow, not a complete maintenance-management, monitoring, ERP, payment, or field-service platform.

## 3. Canonical workflow

~~~text
SIGNAL / REPORT
      ↓
INTAKE
      ↓
IDENTIFY CONTEXT
(customer / site / asset where known)
      ↓
INVESTIGATE
      ↓
SITUATION
(operational interpretation)
      ↓
DETERMINE RESPONSE
      ↓
WORK
(assign accountable actor)
      ↓
ACTION / INTERVENTION
      ↓
EVIDENCE
      ↓
VERIFY OUTCOME
      ↓
RESOLVED / ESCALATED / REOPENED
~~~

The workflow does not require telemetry. A customer report can be the initial signal. Monitoring is one possible evidence source.

## 4. Solar Move incident reconstruction

### 4.1 Initial customer requirement

The customer wanted a well pump. Solar Move asked for the well depth and used the customer's estimate to prepare a quotation.

Domain interpretation:
- Customer: known or created;
- customer-provided information: observation/evidence;
- quotation: commercial context outside the first operational-issue kernel.

### 4.2 Information proves insufficient

After dispatch, the customer reported that the pump was too small to reach the water level. Solar Move accepted the pump back and changed it.

Important rule:

> Customer-provided information is evidence of what the customer reported; it is not automatically a verified diagnosis or authoritative technical fact.

### 4.3 Installation responsibility changes the case context

The customer subsequently used an independent electrician for installation.

Solar Move considered this relevant to warranty because the company did not control or observe the installation process.

Domain interpretation:
- evidence about installation responsibility;
- situation context changes;
- warranty/contract policy may affect the response;
- the system must record evidence and decisions without automatically declaring fault.

The product should not encode Solar Move's warranty policy as a universal rule.

### 4.4 Failure reported

The customer reported that the pump had worked and then stopped.

This is the primary operational-issue trigger.

Domain interpretation:

~~~text
Customer report
    ↓
Observation
    ↓
Event: SERVICE_ISSUE_REPORTED / ASSET_FAULT_REPORTED
    ↓
Situation
~~~

The event records that a problem was reported. It does not itself establish the cause.

### 4.5 Investigation and assignment

Mary referred the case to the chief technician, Mr. Moises.

The pump was returned and inspected. The inspection found that the pump had been buried, while the exact sequence of events remained uncertain.

Domain interpretation:

~~~text
Situation
    ↓
Work Item
    ↓
assigned_actor_id = responsible technician
    ↓
Inspection
    ↓
New evidence
~~~

This directly validates work_items.assigned_actor_id as a concrete responsibility boundary for the first workflow.

### 4.6 Response decision

The case resulted in a decision to provide another pump under a commercially reduced arrangement.

Domain interpretation:

~~~text
Evidence
    ↓
Decision / Recommendation
    ↓
Authorized consequential action
    ↓
Replacement
~~~

The system must represent the decision and action without hard-coding the specific discount policy used in this incident.

### 4.7 Outcome

The replacement pump was sent and the customer relationship was maintained.

The operational record should distinguish:
- action executed;
- customer/system outcome;
- verification of the intended result.

Sending a replacement is not itself proof that the system is functioning.

## 5. Repeated Solar Move issue pattern

The interview indicates that the same general issue class occurs across:
- pumps;
- inverters;
- batteries;
- home backup systems.

Examples include:
- battery discharge from overloading;
- inverter/system complaints;
- customers reporting equipment that stopped working;
- minor faults requiring inspection or intervention;
- customers requiring phone guidance;
- equipment brought back to the office for diagnosis.

Therefore the workflow should be asset-agnostic at the kernel level.

The asset type belongs in asset/context data, not in a separate pump workflow, inverter workflow, or battery workflow.

## 6. Customer fault intake is a first-class operational problem

The interview identifies a specific organizational problem: customers may call the technician who previously visited, the front-desk person who prepared a quotation, another employee, or multiple company numbers when the intended contact is unreachable.

The first product surface therefore needs a reliable operational intake and routing path.

The requirement is not simply "store a complaint." It is to turn an incoming operational signal into a traceable case with enough context for the organization to determine and execute the next step.

Minimum intake context where available:
- organization;
- source actor/channel;
- customer;
- site;
- asset;
- reported problem;
- timestamp;
- supporting evidence;
- correlation/reference.

Unknown fields should remain unknown rather than being fabricated.

## 7. Domain mapping

| Operational reality | V2 domain |
|---|---|
| Customer reports pump stopped | Observation / Event |
| Customer identity established | Customer context |
| Pump/system identified | Asset context |
| Mary refers case to technician | Work assignment |
| Technician inspects pump | Work + Evidence |
| Pump found buried | Evidence |
| Warranty responsibility considered | Situation context + policy/decision |
| Replacement decision made | Recommendation/Decision |
| Replacement pump sent | Action |
| Customer/system outcome confirmed | Verification |
| Record of case | Evidence + Audit |

The canonical kernel remains:

~~~text
Observation
    ↓
Event
    ↓
Situation
    ↓
Work Item
    ↓
Action / Attempt
    ↓
Evidence
    ↓
Verification
~~~

Recommendation/authorization remains between situation and consequential action where required by policy.

## 8. Responsibility boundary

This interview does not establish a need for generic territory, customer-portfolio, asset-portfolio, branch, or service-region assignment.

What it does establish is:

~~~text
Organization
    ↓
Responsible actor
    ↓
Work Item
    ↓
Customer / Site / Asset
~~~

The first implementation should therefore use the existing work assignment mechanism.

Do not create a generic responsibility-scope table until a real workflow demonstrates a recurring organizational boundary that cannot be represented cleanly by assignment.

## 9. Workflow states: discovery contract, not schema freeze

The interview supports these operational phases:

~~~text
REPORTED
   ↓
TRIAGED / IDENTIFIED
   ↓
INVESTIGATING
   ↓
ASSIGNED / IN_PROGRESS
   ↓
RESPONSE EXECUTED
   ↓
AWAITING / VERIFYING
   ↓
RESOLVED
   ↓
CLOSED
~~~

These are workflow concepts, not a decision to add all of them as database status values.

The existing Work Item state machine remains authoritative for Work Item lifecycle. A Situation may remain open while work is incomplete, and verification must not be collapsed into work completion.

Possible terminal outcomes at the workflow level:
- resolved and verified;
- unresolved;
- escalated;
- reopened.

## 10. Cross-operator validation

### Solar Move Africa

~~~text
Customer reports pump failure
→ identify customer/pump
→ refer to technician
→ inspect
→ collect evidence
→ determine response
→ replace
→ verify
~~~

The current kernel can represent this without a new business-model-specific domain.

### DS Solar

Existing discovery evidence describes customers reporting battery failures, overloads and system faults, with diagnosis through communication and site visits.

The same kernel applies:

~~~text
Customer reports system fault
→ identify customer/site/asset
→ investigate
→ assign technician
→ inspect/repair
→ capture evidence
→ verify
~~~

The exact fault codes, warranty rules and field-service details remain pilot-specific.

### Renwasol

Existing discovery evidence describes payment → Primenet → PayGo token generation → token delivery → service-access problems.

The same operational kernel applies:

~~~text
Customer reports service/access problem
→ identify customer/transaction
→ investigate payment/token evidence
→ determine response
→ assign/execute resolution
→ capture evidence
→ verify access
~~~

The payment-specific capability remains bounded. This workflow does not justify importing the legacy financial/settlement domain.

## 11. What this validates

The three operator patterns support a common operational loop:

~~~text
SIGNAL
  ↓
CONTEXT
  ↓
UNDERSTAND
  ↓
DECIDE
  ↓
WORK
  ↓
ACT
  ↓
EVIDENCE
  ↓
VERIFY
~~~

This validates the direction of the V2 operational kernel.

It does not prove:
- a universal workflow engine;
- universal responsibility scopes;
- a universal financial ledger;
- universal telemetry;
- autonomous action by Ellie;
- product-specific kernels.

## 12. Product implication

Enerlectra should not define its initial operational product as a monitoring dashboard.

Monitoring can provide evidence.

The operational value is connecting:

~~~text
signal
→ context
→ decision
→ work
→ action
→ evidence
→ verification
~~~

The first user-facing problem should therefore be framed around:

> A customer or system has an operational issue. Help the organization understand it, route it, act on it, and verify the outcome.

## 13. Minimum first-slice capabilities

The first implementation should be able to:

1. authenticate an actor;
2. resolve organization membership;
3. identify/select customer, site and asset context;
4. record an operational observation;
5. create/normalize an event;
6. create/update a situation;
7. create and assign a work item;
8. record work evidence;
9. create an action where a consequential operation is required;
10. enforce authorization before consequential action;
11. record action attempts/outcomes;
12. record verification;
13. expose the case history/audit trail;
14. support communication as an intake/output channel.

No new generic responsibility engine is required for this slice.

## 14. Explicit exclusions

This workflow does not justify building:
- a generic no-code workflow engine;
- a universal maintenance-management suite;
- a monitoring platform;
- a full ERP;
- a universal financial ledger;
- PAYGo settlement;
- P2P energy trading;
- marketplace functionality;
- blockchain/treasury/staking;
- automated remote control;
- autonomous Ellie authorization or execution.

## 15. Next validation gate

The workflow is sufficiently concrete to move from abstract operating-model discussion toward implementation validation.

Before Migration 019:

1. test this workflow against the existing Work Item and Action contracts;
2. test tenant isolation and authorization using authenticated integration tests;
3. validate the same case pattern against DS Solar and Renwasol evidence;
4. run one detailed Lusaka operator incident walkthrough if responsibility scope remains uncertain;
5. only then introduce schema changes demonstrated by the workflow.

Decision rule:

> Persist the smallest domain boundary required by a real operational workflow. Do not persist an abstraction merely because it may become useful at scale.
