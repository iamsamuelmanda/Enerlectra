# Validation Slice — PAYGo

## 1. Purpose

Define one representative PAYGo workflow used to validate Enerlectra's shared operational kernel against a materially different operating context. This slice is a validation case, not a PAYGo-specific product boundary.

Source contracts:
- `docs/v2/V2-Domain-and-Tenancy-Blueprint.md`
- `docs/v2/V2-Domain-to-Schema-Design.md`
- `docs/v2/V2-RLS-Tenant-Isolation-and-Attack-Model.md`

This is an operational exception-management slice, not a complete PAYGo financial platform.

## 2. Organization profile

Representative operating model:

**PAYGo / recurring-payment energy operator**

The organization may combine energy service, customer finance/payment processes, asset operations, and support.

The label is contextual. It does not determine authorization.

## 3. Enabled capabilities

Initial PAYGo capability profile:
- customer management;
- site and asset management;
- payment evidence intake;
- payment reconciliation/exception handling;
- customer support;
- service exception management;
- maintenance;
- evidence capture;
- communication.

Not required for this slice:
- PCUs;
- energy wallets;
- P2P trading;
- staking;
- cluster economy;
- new consumer settlement engine;
- automated remote disconnection/reconnection;
- credit scoring.

## 4. Initial roles

### Operations manager
- view operational/payment exceptions;
- prioritize and assign work;
- approve consequential operational resolutions.

### Support/operator
- view authorized customer/service context;
- record evidence;
- investigate exceptions;
- create/update permitted situations;
- communicate with customers.

### Finance/reconciliation
- review payment evidence;
- reconcile permitted payment references;
- resolve or escalate payment exceptions.

### Field/service technician
- view assigned service work;
- record field observations/actions;
- submit evidence and outcomes.

### Read-only/auditor
- view permitted records without mutation authority.

Exact permission names remain implementation detail.

## 5. Workflow

### Problem

**Payment evidence → reconciliation/exception → situation → recommendation → authorized resolution → verification.**

Example:

> A payment is recorded, but the customer's expected service/access outcome is unresolved.

### State flow

```
Payment Evidence
      ↓
Normalized Payment Event
      ↓
Exception / Situation
      ↓
Recommendation
      ↓
Authorized Resolution
      ↓
Work / Action Evidence
      ↓
Verification
      ↓
Resolved OR Escalated/Reopened
```

## 6. Step-by-step contract

### Step 1 — Payment evidence

Possible sources:
- trusted provider webhook;
- approved file/import;
- manual authorized entry;
- customer communication containing payment evidence.

Minimum information where available:
- organization;
- customer/account reference;
- payment/provider reference;
- timestamp;
- amount/currency;
- source;
- raw evidence reference.

A payment reference is evidence. It does not automatically establish that service was delivered or that an account is reconciled.

### Step 2 — Normalize event

Candidate event types:
- `PAYMENT_RECORDED`
- `PAYMENT_FAILED`
- `PAYMENT_UNMATCHED`
- `SERVICE_ACCESS_UNRESOLVED`

The event remains traceable to its source.

### Step 3 — Exception / situation

Create a situation only where evidence indicates an operational exception requiring investigation or resolution.

Example:

> “Payment received for customer, but expected service/access outcome cannot be confirmed.”

The situation may combine:
- payment evidence;
- customer history;
- service/asset status;
- prior related cases;
- communication evidence.

### Step 4 — Recommendation

Ellie/system produces a bounded recommendation using only authorized organizational context.

Example:

> Verify payment reference against the customer account, check service status, and escalate to the responsible operator if reconciliation succeeds but service remains unresolved.

Recommendation must distinguish evidence from inference.

It is not automatically executed.

### Step 5 — Authorization

An authorized support/finance/operations actor decides the next step.

Possible decisions:
- reconcile;
- request additional evidence;
- assign service investigation;
- communicate with customer;
- escalate to provider;
- reject unsupported claim.

The system records the decision and actor.

### Step 6 — Authorized resolution

Resolution may involve:
- reconciling a payment reference;
- updating an operational case;
- assigning service work;
- recording customer communication;
- escalating to an external provider.

The first slice must not automatically change customer access/disconnection state merely because an event or recommendation exists.

### Step 7 — Verification

Verification proves the intended outcome.

Examples:
- payment successfully matched;
- service/access status confirmed;
- customer informed;
- field issue resolved;
- provider escalation accepted.

Possible result:
- verified resolved;
- partially resolved;
- unresolved;
- escalated;
- reopened.

## 7. Inputs and outputs

### Inputs
- authenticated actor;
- organization membership;
- trusted payment/service evidence;
- customer/site/asset context where available;
- payment/provider reference;
- communication evidence.

### Outputs
- normalized payment/service event;
- exception situation;
- evidence-linked recommendation;
- authorized resolution/work item;
- verification;
- audit trail.

## 8. Authorization points

Authorization is required at:
1. tenant resolution;
2. customer/payment information access;
3. reconciliation mutation;
4. operational assignment;
5. consequential service action;
6. closure/verification according to organizational policy.

Ellie does not authorize itself.

## 9. Evidence and audit requirements

Payment evidence should retain:
- source/provider;
- external reference;
- timestamp;
- amount/currency where available;
- organization;
- customer/account linkage;
- raw evidence reference;
- normalization/correlation information.

Audit should record consequential operations:
- actor;
- organization;
- action;
- target;
- decision;
- timestamp;
- correlation ID.

Financial evidence and operational state must not be conflated.

## 10. Success metrics

Measure:
- time from payment evidence to resolution;
- number of unmatched payments;
- number of “paid but unresolved” cases;
- age of unresolved payment/service exceptions;
- percentage resolved without repeated customer contact;
- reconciliation backlog;
- time from exception creation to assignment.

Baseline values must be measured during pilot.

## 11. Explicit exclusions

Do not build in this slice:
- PCU accounting;
- energy wallets;
- P2P energy trading;
- marketplace;
- clusters;
- staking;
- blockchain settlement;
- automated remote disconnection/reconnection;
- consumer credit scoring;
- complete billing/ERP;
- universal financial ledger;
- generalized no-code workflow engine.

A future financial capability may be introduced only after the operational workflow and actual requirements are validated.

## 12. Assumptions

- PAYGo organizations receive or record payment evidence.
- Payment/service exceptions create operational work.
- Customer, site, and asset context is useful for resolution.
- Payment evidence can be separated from authoritative financial accounting.
- The first slice does not require a complete replacement for an existing payment provider or billing system.

## 13. Unknowns

- Exact payment providers and identifiers.
- Whether payment references map directly to customers, contracts, or service accounts.
- Exact service/access semantics for each operator.
- Which payment exceptions occur most frequently.
- Which staff role owns reconciliation versus service resolution.
- Whether existing systems expose reliable status APIs.
- Exact audit/retention requirements.

## 14. Customer validation questions

- What happens operationally after a payment is received?
- How are unmatched payments identified?
- How do staff determine whether a customer actually received the expected service?
- Which exceptions generate the most support work?
- How many systems must an operator consult?
- Who can reconcile a payment?
- Who can change service status?
- What evidence is sufficient to close a payment/service exception?
- Which cases require external-provider escalation?
- What information would an operator need to resolve an exception without repeatedly contacting the customer?

## 15. Minimum data required

- organization;
- actor/membership;
- customer;
- site;
- asset where relevant;
- payment evidence/reference;
- observation;
- event;
- situation;
- recommendation;
- work/action record;
- verification;
- audit record.

A full financial ledger is not required for this slice.

## 16. Schema implications

The PAYGo slice validates the need for:
- customers;
- sites;
- assets;
- observations;
- events;
- situations;
- evidence;
- recommendations;
- work items/actions;
- verifications;
- communications;
- audit records;
- a bounded payment-evidence/reference capability.

It does **not** justify importing the legacy settlement, treasury, PCU, wallet, or trading schema into V2.

## 17. Shared-kernel test

The PAYGo workflow must use the same core primitives as the EPC slice:

```
Customer
Site
Asset
Observation
Event
Situation
Recommendation
Work Item
Verification
```

The difference is operating-model context and capability/policy configuration, not a separate domain kernel.


## 17. Market-scope interpretation

PAYGo is a second validation case, not Enerlectra's ICP definition. Its value in the architecture review is that payment/service exceptions exercise materially different evidence, responsibilities, and capabilities while traversing the same operational kernel.

A customer with no payment workflow should not inherit payment functionality. A mixed-model operator may enable payment reconciliation alongside installation, maintenance, field service, or other capabilities.

The active product question remains:

> What operational complexity does this organization actually need Enerlectra to understand and help resolve?

The kernel must stay stable while capabilities, policies, responsibilities, terminology, and external integrations adapt to the organization.
