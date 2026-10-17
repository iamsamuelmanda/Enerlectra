# V2 Action / Execution Design Gate

**Status:** DESIGN SPECIFICATION — FROZEN FOR ARCHITECTURAL REVIEW  
**Implementation status:** NOT IMPLEMENTED  
**Migration status:** No Migration 015 authorized  
**Scope:** V2 operational kernel only

## Purpose

This document defines the semantic boundary between Work and Action/Execution.

A Work Item answers:

> What needs to be accomplished?

An Action answers:

> What authorized operational execution is being attempted?

Execution answers:

> What happened when that execution was attempted?

Evidence answers:

> What source material demonstrates what happened?

Verification answers:

> Did the intended operational outcome actually occur?

The sequence is:

Recommendation / Intent
→ Authorization
→ Action
→ Execution Attempt(s)
→ Execution Result
→ Evidence
→ Event
→ Verification
→ Work / Situation update

This gate is design-only. It must be reviewed before schema or runtime implementation.

---

## 1. Action definition

An **Action** is a tenant-scoped, durable operational execution record representing an authorized operational operation that is intended to be attempted.

An Action is:

- not a Recommendation;
- not an Authorization;
- not a Command;
- not a Work Item;
- not an Execution Attempt;
- not Evidence;
- not an Event;
- not Verification.

Every Action has its own immutable identity.

### Initial relationship

For the first V2 implementation:

    Work Item
        ├── Action A
        ├── Action B
        └── Action C

Every Action MUST belong to exactly one Work Item.

Action without Work Item is out of scope for the first kernel. Future administrative/system actions may be considered separately after real use cases establish the need.

---

## 2. Work vs Action

Work organizes the operational response.

Action records a specific authorized execution operation.

Example:

    Situation
    Possible service interruption at Site 017
        ↓
    Work Item
    Investigate Site 017
        ↓
    Action 1
    Contact customer
        ↓
    Action 2
    Inspect inverter
        ↓
    Action 3
    Restart inverter
        ↓
    Action 4
    Verify restoration

One Work Item MAY therefore produce multiple Actions.

An Action MUST NOT merely be a status field on Work Item.

---

## 3. Recommendation, authorization, and execution

The required conceptual boundary is:

    Recommendation / Intent
             ↓
        Authorization
             ↓
           Action
             ↓
         Execution

The following is prohibited:

    Recommendation
          ↓
        Action

Creating an Action does not authorize it.

An executable Action MUST have an identifiable authorization basis.

Possible authorization sources include:

- explicit human authorization;
- organization policy authorization;
- trusted integration authorization;
- explicitly bounded pre-authorized automation.

The exact storage mechanism for each authorization source remains an implementation decision, but the semantic requirement is frozen.

---

## 4. AI authorization boundary

The future intelligence boundary is:

    Ellie
      ↓
    Recommendation
      ↓
    Authorization
      ↓
    Action
      ↓
    Execution

Ellie MAY:

- identify situations;
- interpret evidence;
- explain evidence;
- recommend Work;
- recommend Actions;
- provide rationale;
- estimate consequences.

Ellie MUST NOT:

- authorize itself;
- bypass action.authorize;
- directly execute an Action;
- mutate authoritative operational state merely because it believes an action is correct.

Future autonomous execution, if ever introduced, MUST require explicit organization policy granting bounded authority. AI capability itself is not authorization.

---

## 5. Action actors

The existing V2 identity model distinguishes Actor, Membership, Organization, Role, and Permission.

Action semantics must distinguish:

- requested by;
- authorized by;
- executed by.

These identities MAY be different.

For example:

    requested_by  = operator
    authorized_by = supervisor
    executed_by   = field technician

The initial model SHOULD reuse the existing Actor identity rather than introducing a new actor hierarchy.

System or external execution identities require a separate, explicit design where needed. External provider identifiers MUST NOT become authorization identities.

---

## 6. Authorization requirements

An authorization operation MUST establish:

- authenticated identity;
- active organization membership;
- organization/tenant scope;
- required permission;
- action-specific authorization rules;
- explicit authorization state/history.

The existing permission boundary remains distinct:

    recommendation.read
    ≠ action.authorize
    ≠ work.execute

Possessing one does not implicitly grant the others.

An Action MUST NOT execute while merely PROPOSED.

---

## 7. Action lifecycle

The minimum conceptual lifecycle is:

    PROPOSED
       ↓
    AUTHORIZED
       ↓
    EXECUTING
       ↓
    SUCCEEDED
       or
    FAILED
       or
    UNKNOWN

Additional states such as REJECTED, CANCELLED, EXPIRED, or TIMED_OUT may be introduced only when a concrete execution scenario requires their distinct semantics.

### Important distinction

Action success is not outcome verification.

    Action
      ↓
    execution accepted
      ≠
    desired operational condition verified

Example:

    Action:
    Restart inverter

    Execution result:
    Controller accepted restart command

    Evidence:
    Device subsequently reports normally

    Verification:
    Output remains stable for required period

The accepted command does not itself prove restoration.

---

## 8. Action Attempt is first-class

**Decision: Action Attempt is a first-class semantic entity.**

An Action represents one logical operational operation.

An Attempt represents one actual execution try.

Therefore:

    Action A
       ├── Attempt 1 → TIMEOUT
       ├── Attempt 2 → ACKNOWLEDGED
       └── Attempt 3 → SUCCESS

Retries MUST NOT create new logical Actions merely because transport or execution was retried.

This distinction is required for:

- retry handling;
- timeout ambiguity;
- duplicate prevention;
- provider references;
- execution duration;
- external acknowledgements;
- auditability.

The exact schema is not yet frozen.

---

## 9. Retry and idempotency

Retry semantics have two levels:

**Logical identity**

Identifies the intended operation:

    action_id

**Execution identity**

Identifies a specific attempt:

    attempt_id

A stable execution/idempotency identity SHOULD survive transport retries.

Conceptually:

    Action
      ↓
    Attempt 1
      ↓ timeout
    Attempt 2
      ↓ acknowledged

The system MUST preserve the fact that one logical Action produced multiple attempts.

Where an external provider supports idempotency, the same stable execution identity SHOULD be supplied to that provider.

A transport timeout MUST NOT automatically create a new Action.

---

## 10. Attempt vs outcome

Execution attempts and their outcomes are distinct.

Example:

    Action
    Send customer payment reminder

        ↓

    Attempt
    Provider request submitted

        ↓

    Result
    Provider rejected request

The system should be able to represent:

- attempted = true;
- succeeded = false;
- failure reason;
- external reference;
- timing;
- provider response.

An execution attempt MUST NOT be treated as successful merely because it was submitted.

---

## 11. UNKNOWN execution state

External execution can produce an ambiguous result.

Example:

    SEND_PAYMENT
        ↓
    request submitted
        ↓
    network timeout
        ↓
    actual provider state unknown

The system MUST be capable of representing **UNKNOWN** execution state.

UNKNOWN MUST NOT automatically become FAILED when an external side effect may already have occurred.

This is especially important for:

- financial operations;
- physical/device commands;
- external APIs;
- notifications;
- other consequential integrations.

Resolution of UNKNOWN is a separate operational process and may require external reconciliation or new Evidence.

---

## 12. Side-effect semantics

Action semantics must distinguish action type from execution consequence.

The system needs to know whether an Action can change something outside Enerlectra's own operational record.

Conceptual consequence classes include:

- OBSERVATIONAL
- COMMUNICATION
- OPERATIONAL
- FINANCIAL
- PHYSICAL
- EXTERNAL_SYSTEM

These are design concepts, not a frozen SQL enum.

Do not create a large permanent taxonomy until concrete execution scenarios require it.

Examples:

    Record inspection result
        → internal operational state

    Send WhatsApp message
        → external communication side effect

    Restart inverter
        → physical/system side effect

    Initiate payment
        → financial side effect

Authorization requirements may depend on consequence, not merely action name.

---

## 13. Internal vs external execution

Two execution environments exist conceptually.

### Internal

    Action
      ↓
    Enerlectra service
      ↓
    internal domain mutation

### External

    Action
      ↓
    execution adapter
      ↓
    provider/device/system
      ↓
    external result

External execution may require:

- external system identity;
- external reference;
- request reference;
- response reference.

Provider-specific execution mechanics belong to the relevant adapter.

Do NOT create a universal integration execution engine as part of this kernel.

---

## 14. Evidence boundary

Action execution MAY produce Evidence.

Action execution MUST NOT directly declare operational truth.

Example:

    Action
    Restart inverter
        ↓
    Execution result
    Restart command accepted
        ↓
    Evidence
    Provider/device confirms command accepted
        ↓
    Event
    equipment.restart_command_accepted

This MUST NOT automatically become:

    equipment.reporting_restored

Restoration requires independent evidence supporting that operational-world fact.

Therefore:

    Action
      ↓
    Execution Result
      ↓
    Evidence
      ↓
    Event
      ↓
    Verification

---

## 15. Event boundary

Action lifecycle events describe platform execution facts.

Potential events include:

- action.proposed
- action.authorized
- action.execution_started
- action.execution_succeeded
- action.execution_failed
- action.execution_unknown
- action.cancelled

These events MUST NOT be confused with domain facts.

For example:

    action.execution_succeeded
        ≠
    equipment.reporting_restored

The first describes Enerlectra's execution state.

The second describes an operational-world fact and requires appropriate Evidence.

Action does not become another event store.

---

## 16. Failure semantics

Failure has distinct layers.

### Authorization failure

The Action is not permitted to execute.

### Execution failure

    Authorized Action
        ↓
    Attempted
        ↓
    FAILED

### Unknown execution

    Request may have reached external system
        ↓
    response unavailable
        ↓
    UNKNOWN

UNKNOWN MUST remain distinct from FAILED where side effects may have occurred.

---

## 17. Audit vs Evidence

These concepts remain separate.

**Evidence**

What source material demonstrates what happened in the operational world?

**Audit**

What did Enerlectra or an authorized actor do?

Action history should capture operational control-plane facts such as:

- proposal;
- authorization;
- execution;
- attempt;
- result;
- cancellation.

Evidence remains the source material used to establish operational facts.

Do not turn Action history into a universal operational event store.

---

## 18. Tenant isolation

Every Action MUST be tenant-scoped.

Conceptually:

    action.organization_id
        =
    work_item.organization_id

Every Action Attempt MUST belong to the same organization as its Action.

Execution actors MUST either:

- be active members of the same organization; or
- use an explicitly trusted system execution identity.

Cross-tenant execution MUST be impossible.

External provider references MUST NOT establish tenant authorization.

Inbound external callbacks MUST resolve organization context through trusted integration configuration, consistent with the V2 tenant model.

---

## 19. Command vs Action

The existing command architecture remains useful infrastructure.

However:

**Command**

= application/transport instruction sent to a handler.

**Action**

= durable operational execution record governed by authorization and execution lifecycle.

They MUST NOT be merged.

The relationship, where needed, is:

    authorized Action
        ↓
    application command
        ↓
    execution adapter
        ↓
    external/internal execution
        ↓
    Attempt result

Existing legacy command types MUST NOT define the V2 Action domain.

---

## 20. Legacy boundary

Legacy execution concepts remain isolated.

The following MUST NOT become V2 Action semantics:

- marketplace transactions;
- PCU operations;
- wallet transfers;
- settlement;
- staking;
- blockchain execution;
- legacy treasury;
- legacy workflow execution;
- old ticket/work-order semantics.

Legacy code may be reused only when it provides infrastructure that does not import legacy domain meaning into V2.

---

## 21. Frozen invariants

The following invariants are design constraints for implementation review.

**A-001** — Every Action belongs to exactly one organization.

**A-002** — Every Action belongs to exactly one Work Item in the same organization.

**A-003** — Creating an Action does not authorize it.

**A-004** — Only an appropriately authorized actor/system may authorize an Action.

**A-005** — An Action cannot execute unless authorized.

**A-006** — Authorization and execution identities may differ.

**A-007** — Every execution Attempt belongs to exactly one Action.

**A-008** — Retries do not create new logical Actions.

**A-009** — Execution Attempt does not imply execution success.

**A-010** — Unknown external execution state cannot automatically be classified as failure.

**A-011** — Action execution cannot directly assert operational resolution.

**A-012** — Execution-generated Evidence remains Evidence.

**A-013** — Domain Events must be grounded in appropriate Evidence.

**A-014** — Action success does not imply Work completion.

**A-015** — Work completion does not imply Situation resolution.

**A-016** — Recommendation does not imply authorization.

**A-017** — Ellie cannot bypass authorization.

**A-018** — Cross-tenant execution is prohibited.

**A-019** — External references cannot establish tenant authorization.

**A-020** — Legacy marketplace/settlement/PCU execution primitives do not become V2 Action semantics.

---

## 22. Required implementation tests

Migration 015+ MUST eventually prove:

### Authorization

- unauthorized actor cannot authorize;
- authorized actor can authorize;
- proposed Action cannot execute;
- unauthorized Action cannot execute;
- recommendation cannot directly execute.

### Tenant isolation

- organization A cannot read organization B Actions;
- organization A cannot create/authorize/execute organization B Actions;
- cross-tenant Work Item linkage is rejected;
- cross-tenant execution actor is rejected.

### Actor separation

- authorized_by and executed_by may differ;
- both identities remain correctly attributable.

### Lifecycle

At minimum:

    PROPOSED
      → AUTHORIZED
      → EXECUTING
      → SUCCEEDED

and:

    PROPOSED
      → AUTHORIZED
      → EXECUTING
      → FAILED

plus the external UNKNOWN scenario.

### Retry

- one logical Action may have multiple Attempts;
- retry does not create another Action;
- attempts retain distinct identities and results.

### Idempotency

- repeated transport submission with the same execution identity does not duplicate a consequential operation where the execution adapter/provider supports idempotency;
- duplicate detection remains tenant-scoped.

### Evidence

- execution can produce Evidence;
- execution success does not itself create operational resolution;
- operational Events remain distinct from Action execution events.

### Work / Situation

- Action success does not automatically complete Work;
- Work completion does not automatically resolve Situation.

### AI

- Ellie Recommendation cannot authorize;
- Ellie Recommendation cannot execute;
- AI execution requires an explicit future authorization policy.

---

## 23. Explicit non-goals

This gate does NOT introduce:

- Migration 015;
- Action tables;
- Action Attempt tables;
- Action handlers;
- Verification tables;
- autonomous Ellie execution;
- universal workflow engine;
- universal transaction engine;
- payment ledger;
- wallet;
- settlement;
- PCU;
- marketplace;
- blockchain execution;
- generic plugin executor;
- remote device-control framework;
- generalized scheduler;
- route optimizer;
- procurement engine;
- inventory engine;
- automatic Situation resolution;
- automatic Work completion;
- autonomous AI authorization;
- large action taxonomy;
- separate EPC/PAYGo Action systems.

---

## 24. Proposed conceptual model

    WORK ITEM
        │
        └── ACTION
              │
              ├── ATTEMPT 1
              ├── ATTEMPT 2
              └── ATTEMPT 3
                    │
                    ↓
              EXECUTION RESULT
                    │
                    ↓
                 EVIDENCE
                    │
                    ↓
                  EVENT
                    │
                    ↓
              VERIFICATION
                    │
                    ↓
             WORK / SITUATION

Recommendation remains above the authorization boundary:

    RECOMMENDATION
          ↓
     AUTHORIZATION
          ↓
        ACTION
          ↓
      EXECUTION

---

## 25. Gate decision

**Action / Execution is a semantic design boundary, not yet an implementation boundary.**

The following are frozen for architectural review:

- Action is distinct from Work;
- Action requires Work Item in the first V2 kernel;
- authorization is distinct from Action creation;
- Action Attempt is first-class;
- retries do not create logical Actions;
- UNKNOWN execution state is distinct from FAILED;
- execution success is distinct from verification;
- Action execution can produce Evidence but cannot declare operational truth;
- platform execution Events remain distinct from operational-world Events;
- tenant isolation applies to Actions and Attempts;
- Recommendation does not imply Authorization;
- Ellie cannot bypass Authorization;
- legacy execution domains remain isolated.

**Migration 015 is NOT authorized by this document.**

The next decision is architectural review of this specification. Only after approval should the minimum Action/Attempt schema and execution command boundary be designed.
