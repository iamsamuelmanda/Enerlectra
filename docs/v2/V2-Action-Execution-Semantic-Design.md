# V2 Action / Execution Semantic Design

## Purpose

This document freezes the semantic boundary for **Action / Execution** before Migration 015.

Enerlectra remains one application. This is a domain-design gate, not a second application and not an implementation proposal for a generic execution engine.

The governing distinction is:

> **Work = what needs to be accomplished.**  
> **Action = what was actually attempted/executed.**

The operational chain is:

```
Recommendation / Intent
        ↓
Authorization
        ↓
Action
        ↓
Execution Attempt(s)
        ↓
Execution Result
        ↓
Evidence
        ↓
Event
        ↓
Verification
        ↓
Work / Situation update
```

No Action implementation is authorized by this document alone. Migration 015 must follow a separate implementation gate.

---

## 1. Action semantic definition

An **Action** is a durable record of an authorized operational execution intent and its execution lifecycle.

Action is not:

- a Recommendation;
- an authorization decision;
- a transport/application Command;
- an execution attempt;
- an execution result;
- Evidence;
- a normalized domain Event;
- Verification;
- Work completion.

An Action has its own identity and lifecycle and represents the logical operation being carried out.

Examples:

- contact a customer;
- dispatch a technician;
- request a diagnostic;
- request an inverter restart.

---

## 2. Relationship to Work Item

The first V2 Action model is deliberately constrained:

- every Action belongs to exactly one Work Item;
- a Work Item may produce zero, one, or multiple Actions;
- multiple Actions may be necessary to move one Work Item forward;
- an Action does not automatically complete its Work Item;
- successful Action execution does not automatically resolve the Situation.

Initial relationship:

```
Situation
  └── Work Item
        ├── Action A
        ├── Action B
        └── Action C
```

Standalone Actions are out of scope for the first Action kernel.

---

## 3. Authorization model

Creating an Action does **not** authorize it.

The minimum conceptual lifecycle is:

```
PROPOSED → AUTHORIZED → EXECUTING → SUCCEEDED
                              └────→ FAILED
                              └────→ EXECUTION_UNKNOWN
```

Authorization is an explicit boundary.

Required rules:

- only an actor holding `action.authorize` may authorize an Action;
- `recommendation.read` does not imply authorization;
- `work.execute` does not imply Action authorization;
- an unauthorized Action cannot execute;
- authorization must be attributable to an actor or explicitly bounded trusted system identity;
- authorization and execution may be performed by different actors.

Consequence-sensitive authorization should ultimately depend on the Action's consequence class, not merely its action name.

---

## 4. Actor vs executor

The existing Actor / Membership / Role / Permission model remains the identity foundation.

Conceptually distinguish:

- `requested_by`: who requested/proposed the Action;
- `authorized_by`: who authorized it;
- `executed_by`: who or what executed it.

These are not interchangeable.

A human operator may authorize an Action that a system adapter executes. A technician may authorize one Action and another technician may execute it, subject to organization policy and permissions.

External systems do not need to become first-class Actors in the initial model.

---

## 5. Action lifecycle

The Action lifecycle must preserve authorization and execution boundaries:

```
PROPOSED
   ↓
AUTHORIZED
   ↓
EXECUTING
   ├── SUCCEEDED
   ├── FAILED
   └── EXECUTION_UNKNOWN
```

Cancellation may be introduced if a concrete operational scenario requires it, but it should not be added merely for symmetry.

A terminal execution result does not imply a domain outcome.

For example:

```
Action: restart inverter
Result: provider accepted restart request
≠
Fact: inverter is operating normally
```

The latter requires subsequent evidence and verification.

---

## 6. Attempt vs outcome

Action, execution attempt, and outcome are separate concepts.

**Action** = one logical operation.

**Attempt** = one actual execution try.

**Outcome** = what the execution attempt established about execution.

Example:

```
Action: SEND_PAYMENT_REMINDER
  ├── Attempt 1 → provider timeout
  ├── Attempt 2 → provider rejected
  └── final execution state → FAILED
```

The two attempts must remain distinguishable.

A first-class `action_attempts` entity is therefore the preferred semantic model because flattening retries into Action loses execution history and makes external side-effect reasoning ambiguous.

---

## 7. Internal vs external execution

Two execution contexts are supported conceptually.

### Internal

```
Action → Enerlectra service → domain operation
```

The result is produced by Enerlectra-controlled execution.

### External

```
Action → Enerlectra adapter → external API/device/provider → result
```

External execution may require:

- external system identifier;
- external request/reference identifier;
- response/reference identifier;
- provider result code;
- provider response summary;
- execution provenance.

The Action model must record these facts without becoming a generic integration engine.

Provider-specific execution logic remains inside adapters.

---

## 8. Idempotency and retry

Logical Action identity and execution-attempt identity must be separate.

A transport retry must not silently create a second logical Action.

The execution model needs a stable idempotency key that survives transport retries and can be passed to an external provider where that provider supports idempotency.

Conceptually:

```
Logical Action ID
      +
Execution key
      +
External reference
```

The system must be able to distinguish:

- two attempts belonging to one Action;
- two independent Actions that intentionally perform the same operation.

For consequential external operations, an unknown result must not be retried blindly when doing so could duplicate the side effect.

---

## 9. Side-effect classification

Do not freeze a giant permanent action-type taxonomy at this stage.

The semantic model should distinguish:

- `action_type`;
- `consequence_class`;
- `execution_target`.

Potential consequence classes are:

- OBSERVATIONAL
- COMMUNICATION
- OPERATIONAL
- FINANCIAL
- PHYSICAL
- EXTERNAL_SYSTEM

These are design concepts, not a Migration 015 SQL enum yet.

Authorization should ultimately consider consequence, because two actions with similar names can have materially different consequences.

---

## 10. Evidence production

Execution can produce Evidence.

Execution does **not** directly declare operational truth.

Example:

```
Action: restart inverter
        ↓
Provider response: restart accepted
        ↓
Observation / Evidence
        ↓
Event: equipment.restart_command_accepted
```

This must not automatically become:

```
equipment.reporting_restored
```

A command acceptance is evidence that the command was accepted, not evidence that the equipment recovered.

Evidence remains the basis for later Event recognition and Verification.

---

## 11. Event generation

Execution may generate platform execution events such as:

- `action.proposed`
- `action.authorized`
- `action.execution_started`
- `action.execution_succeeded`
- `action.execution_failed`
- `action.cancelled`

These describe the execution lifecycle.

They are not automatically domain truth.

For example:

```
action.execution_succeeded
≠
equipment.reporting_restored
```

Domain Events must remain grounded in Evidence and domain semantics.

---

## 12. Failure semantics

Failure must distinguish at least three boundaries:

### Authorization failure

The Action was not authorized and therefore must not execute.

### Execution failure

The Action was authorized, execution was attempted, and the system has evidence that execution failed.

### Execution unknown

Execution was initiated, but the result is uncertain.

Example:

```
POST payment request
        ↓
network timeout
        ↓
unknown whether provider received/processed it
```

The system must not automatically classify this as a clean failure for consequential operations.

An explicit `EXECUTION_UNKNOWN` state, or an equivalent representation with the same semantics, is required before implementing external consequential execution.

---

## 13. Audit and history

Action execution must preserve:

- who requested it;
- who authorized it;
- who/system executed it;
- what was attempted;
- when it was attempted;
- execution result;
- external system/reference where applicable;
- associated Evidence;
- correlation/causation context.

Keep two concepts distinct:

**Evidence** = what happened in the operational world.

**Audit** = what Enerlectra or an actor did.

Action history must not become a universal event store.

---

## 14. Tenant and RLS boundary

Every Action is tenant-scoped.

Required invariants:

- `actions.organization_id` is non-null;
- Action organization equals Work Item organization;
- every Action Attempt carries the same organization boundary;
- execution actors must be active members of the Action organization, or be an explicitly trusted system identity;
- external provider references are never authorization evidence;
- cross-tenant Action visibility, authorization, and execution are prohibited;
- webhook results must resolve trusted tenant context rather than accepting tenant identity from an untrusted payload.

The same tenant boundary applies across API, database/RLS, jobs, events, webhooks, AI retrieval, prompts, storage, reports, and caches.

---

## 15. AI authorization boundary

Ellie is an intelligence/recommendation component, not an implicit authority.

The boundary is:

```
ELLIE
  ↓
RECOMMENDATION
  ↓
AUTHORIZATION
  ↓
ACTION
  ↓
EXECUTION
```

Ellie may:

- identify a situation;
- explain supporting evidence;
- recommend Work;
- recommend an Action;
- explain likely consequences.

Ellie may not:

- authorize itself;
- bypass `action.authorize`;
- directly execute an Action;
- mutate authoritative state because it believes an Action is correct.

Future autonomous operation, if ever required, must be introduced as an explicit bounded organization policy and authorization mechanism rather than being implicit in AI behavior.

---

## 16. Existing-code conflicts

The existing repository contains command/event infrastructure that can provide implementation primitives, but it is not V2 Action semantics.

Existing command contracts include metadata such as:

- actor ID;
- organization ID;
- correlation ID;
- causation ID;
- timestamp.

That metadata is useful.

However:

**Command ≠ Action.**

A Command is an application/transport invocation.

An Action is a durable operational execution record with authorization and execution history.

The existing legacy workflow engine and command factory contain V1 conversational and execution semantics. They must not be promoted wholesale into the V2 Action domain.

Relevant legacy areas include:

- `enerlectra-core/src/core/contracts/commands.ts`
- command bootstrap/handlers;
- translation command factory;
- result mapper;
- workflow engine.

These may be mined for reusable infrastructure after semantic review, but their existing command vocabulary does not define V2 Action.

---

## 17. Legacy concepts isolation

The following remain V1/reference concepts and do not become V2 Action semantics:

- marketplace;
- PCU;
- wallet;
- cluster;
- P2P trading;
- settlement;
- staking;
- blockchain execution;
- legacy payment/treasury execution primitives.

A legacy operation that resembles an Action does not establish the V2 Action model.

No V2 Action design should inherit assumptions from the old decentralized energy-trading architecture.

---

## 18. Proposed schema

This is a semantic proposal, not Migration 015.

### actions

```
id
organization_id
work_item_id
action_type
consequence_class
status
requested_by_actor_id
authorized_by_actor_id
executed_by_actor_id
requested_at
authorized_at
started_at
completed_at
idempotency_key
target/reference metadata
created_at
updated_at
```

### action_attempts

```
id
organization_id
action_id
attempt_number
status
executor_actor_id
executor_type
idempotency_key
started_at
finished_at
external_system
external_reference
request_reference
response_reference
result_code
result_summary
error_code
error_summary
correlation_id
causation_id
created_at
```

### action_history

Potentially:

```
id
organization_id
action_id
event_type
previous_status
new_status
actor_id
reason
correlation_id
occurred_at
metadata
```

The exact minimum schema remains an implementation decision after scenario review. Do not automatically implement all three tables merely because they are listed here.

---

## 19. Proposed invariants

| ID | Invariant |
|---|---|
| A-001 | Every Action belongs to exactly one organization. |
| A-002 | Every Action belongs to exactly one Work Item in the same organization. |
| A-003 | Creating an Action does not authorize it. |
| A-004 | Only an actor with `action.authorize` may authorize it. |
| A-005 | An unauthorized Action cannot execute. |
| A-006 | Authorization and execution actors may differ. |
| A-007 | Every execution Attempt belongs to exactly one Action. |
| A-008 | Retries do not create new logical Actions. |
| A-009 | An execution Attempt is not equivalent to success. |
| A-010 | An unknown external result cannot automatically be classified as failure. |
| A-011 | Execution cannot directly assert operational resolution. |
| A-012 | Execution-generated Evidence remains Evidence. |
| A-013 | Domain Events must be grounded in Evidence/domain semantics. |
| A-014 | Action success does not equal Work completion. |
| A-015 | Work completion does not equal Situation resolution. |
| A-016 | Recommendation does not equal authorization. |
| A-017 | Ellie cannot bypass authorization. |
| A-018 | Cross-tenant execution is prohibited. |
| A-019 | External references cannot establish tenant authorization. |
| A-020 | Legacy marketplace/settlement/PCU execution primitives do not define V2 Action semantics. |

---

## 20. Required tests before the Action gate can be considered complete

The implementation gate should test at minimum:

1. unauthorized actor cannot authorize;
2. authorized actor can authorize;
3. a Recommendation cannot execute by itself;
4. unauthorized Action cannot execute;
5. cross-tenant Action visibility is denied;
6. cross-tenant authorization is denied;
7. cross-tenant execution is denied;
8. authorized_by and executed_by may differ;
9. valid PROPOSED → AUTHORIZED → EXECUTING → SUCCEEDED lifecycle;
10. valid lifecycle ending in FAILED;
11. external timeout can produce EXECUTION_UNKNOWN;
12. one logical Action can have multiple Attempts;
13. transport retry does not duplicate a consequential external operation when idempotency is supported;
14. execution success can produce Evidence without producing Verification;
15. Action success does not complete Work;
16. Work completion does not resolve Situation;
17. Ellie recommendation does not authorize an Action;
18. Ellie cannot directly execute an Action.

Tests must use the real authenticated tenant boundary where applicable, not only elevated SQL/editor access.

---

## 21. Explicitly not built by this gate

This design does **not** authorize implementation of:

- a generic workflow engine;
- autonomous Ellie execution;
- a universal command-bus replacement;
- a universal transaction engine;
- a payment ledger;
- wallets;
- settlement;
- PCU;
- marketplace;
- blockchain execution;
- generic plugin execution;
- arbitrary executable organization policies;
- a remote-device-control framework;
- a generalized scheduler;
- route optimization;
- procurement;
- inventory management;
- automatic Situation resolution;
- automatic Work completion;
- autonomous AI authorization;
- a giant Action-type taxonomy;
- separate EPC and PAYGo Action systems.

---

## Design decision before Migration 015

The preferred semantic model is:

```
WORK ITEM
  └── ACTION
        ├── ATTEMPT 1
        ├── ATTEMPT 2
        └── ATTEMPT 3
              ↓
           EVIDENCE
              ↓
            EVENT
              ↓
        VERIFICATION
              ↓
        WORK / SITUATION UPDATE
```

A first-class `action_attempts` concept is retained because external execution can timeout, retry, or produce uncertain results without changing the identity of the logical Action.

The next step is **architectural review of this design**. Migration 015 must not be created until the Action semantic contract, invariants, and minimal schema are explicitly accepted.
