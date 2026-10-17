# V2 Action / Execution Schema Design

**Status:** DESIGN — READY FOR IMPLEMENTATION REVIEW  
**Prerequisite:** V2 Action / Execution semantic specification approved  
**Implementation status:** NOT IMPLEMENTED  
**Migration:** 015 NOT YET CREATED

## 1. Design objective

Translate the frozen Action / Execution semantics into the smallest durable relational model that can enforce:

- tenant isolation;
- Work → Action ownership;
- authorization before execution;
- separation of Action from execution Attempts;
- retry without duplicate logical Actions;
- UNKNOWN execution state;
- actor attribution;
- external execution references;
- append-only authorization/execution history;
- separation between execution facts and operational Evidence.

No provider-specific execution model is introduced here.

---

## 2. Minimal durable entities

The first implementation requires three tables:

1. `actions` — logical operational Action.
2. `action_attempts` — individual execution attempts.
3. `action_history` — append-only control-plane history.

The model is:

    Work Item
        │
        └── Action
              │
              ├── Attempt 1
              ├── Attempt 2
              └── Attempt N

    Action
        │
        └── History

Evidence, Events, and Verification remain separate existing/future domain concerns.

---

## 3. actions

Conceptual fields:

| Field | Meaning |
|---|---|
| id | immutable Action identity |
| organization_id | tenant boundary |
| work_item_id | owning Work Item |
| status | current Action lifecycle state |
| action_type | semantic operation being requested/executed |
| requested_by_actor_id | actor who requested/proposed the Action |
| authorized_by_actor_id | actor/system that authorized it |
| requested_at | proposal/request time |
| authorized_at | authorization time |
| started_at | first execution start time |
| completed_at | terminal execution time |
| idempotency_key | logical Action creation idempotency |
| target/reference data | bounded target context required for execution |
| correlation_id | distributed operation correlation |
| causation_id | causal predecessor |
| created_at | persistence timestamp |
| updated_at | persistence timestamp |

### Required constraints

- `organization_id NOT NULL`
- `work_item_id NOT NULL`
- composite FK `(organization_id, work_item_id)` → Work Item
- Action organization cannot be changed after creation
- Work Item cannot be changed after creation
- requested actor must resolve within the tenant
- authorized actor must resolve within the tenant
- `authorized_at` is null until authorization exists
- `authorized_by_actor_id` is null until authorization exists
- `completed_at` is null until terminal execution state
- Action cannot enter execution state before authorization
- Action creation does not itself authorize
- no authenticated DELETE

---

## 4. Action status

Initial status vocabulary:

    PROPOSED
    AUTHORIZED
    EXECUTING
    SUCCEEDED
    FAILED
    UNKNOWN

Initial allowed transitions:

    PROPOSED → AUTHORIZED
    PROPOSED → CANCELLED [only if cancellation proves necessary]
    AUTHORIZED → EXECUTING
    AUTHORIZED → CANCELLED [only if cancellation proves necessary]
    EXECUTING → SUCCEEDED
    EXECUTING → FAILED
    EXECUTING → UNKNOWN
    UNKNOWN → EXECUTING [only when reconciliation/retry semantics justify it]
    UNKNOWN → SUCCEEDED
    UNKNOWN → FAILED

**Review point:** CANCELLED is intentionally not part of the mandatory first implementation until a concrete cancellation scenario establishes distinct semantics. If implementation requires it, it must be added explicitly rather than silently treating cancellation as failure.

Terminality:

- SUCCEEDED is terminal.
- FAILED is terminal only when the system has established that execution did not occur or did not produce the intended execution result.
- UNKNOWN is deliberately non-terminal because external state may remain unresolved.

An Action status is a summary of execution state. It is not operational-world verification.

---

## 5. action_attempts

An Attempt represents one actual execution try for an Action.

Conceptual fields:

| Field | Meaning |
|---|---|
| id | immutable Attempt identity |
| organization_id | tenant boundary |
| action_id | parent Action |
| attempt_number | ordered attempt number |
| status | attempt execution state |
| executor_actor_id | human executor where applicable |
| executor_type | bounded execution identity class |
| execution_key | stable execution identity/idempotency reference |
| started_at | attempt start |
| finished_at | attempt finish |
| external_system | provider/device/system identifier |
| external_reference | provider-side reference |
| request_reference | outbound request identifier |
| response_reference | response/callback identifier |
| result_code | provider/application result code |
| result_summary | normalized result description |
| error_code | normalized error code |
| error_summary | normalized failure description |
| correlation_id | operation correlation |
| causation_id | causal predecessor |
| created_at | persistence timestamp |

### Required constraints

- `organization_id NOT NULL`
- `action_id NOT NULL`
- composite FK `(organization_id, action_id)` → Action
- Attempt cannot belong to an Action in another organization
- `attempt_number` unique within an Action
- no authenticated DELETE
- Attempt identity is immutable
- parent Action identity is immutable

Suggested uniqueness:

    UNIQUE (organization_id, action_id, attempt_number)

---

## 6. Attempt status

Initial attempt states:

    STARTED
    SUCCEEDED
    FAILED
    UNKNOWN

The attempt status answers:

> What happened with this particular execution try?

It does not answer:

> Did the operational objective ultimately succeed?

An attempt may be:

    STARTED → SUCCEEDED
    STARTED → FAILED
    STARTED → UNKNOWN

UNKNOWN remains necessary when the system cannot establish whether an external side effect occurred.

---

## 7. Executor identity

Do not create a new Actor hierarchy.

Initial conceptual model:

    executor_type
        HUMAN
        SYSTEM
        EXTERNAL

and:

    executor_actor_id nullable

Rules:

- HUMAN execution should identify an active Actor.
- SYSTEM execution requires an explicitly trusted execution identity.
- EXTERNAL identifies execution performed by an external system/provider where no Enerlectra Actor exists.
- External provider identifiers are references, not authorization identities.

The exact enum/value set should remain implementation-flexible until the first external execution adapter proves the required cases.

---

## 8. Authorization representation

Authorization is represented on the Action as:

- current authorization state;
- authorized actor;
- authorization timestamp.

Authorization MUST be performed through a protected application/database boundary that checks:

1. authenticated actor;
2. active membership;
3. target organization;
4. `action.authorize`;
5. Action state is PROPOSED;
6. Work Item belongs to same organization.

The database should derive `authorized_by_actor_id` from trusted actor context rather than accepting it as authoritative client input.

Authorization should produce an append-only history record.

---

## 9. action_history

`action_history` is the control-plane audit trail for Action lifecycle transitions.

Conceptual fields:

| Field | Meaning |
|---|---|
| id | immutable history identity |
| organization_id | tenant boundary |
| action_id | Action |
| event_type | lifecycle event |
| previous_status | previous Action status |
| new_status | resulting Action status |
| actor_id | actor/system responsible |
| reason | optional reason |
| correlation_id | operation correlation |
| causation_id | causal predecessor |
| metadata | bounded structured context |
| occurred_at | event time |

Initial event types:

- ACTION_CREATED
- ACTION_AUTHORIZED
- ACTION_EXECUTION_STARTED
- ACTION_EXECUTION_SUCCEEDED
- ACTION_EXECUTION_FAILED
- ACTION_EXECUTION_UNKNOWN
- ACTION_CANCELLED if cancellation is later approved

History MUST be append-only from authenticated clients.

As with Work Item history, database-owned triggers should generate lifecycle history from real Action changes rather than allowing clients to manufacture arbitrary audit rows.

---

## 10. Action vs Attempt state

The two statuses have different meanings.

**Action status**

> What is the current state of the logical operational operation?

**Attempt status**

> What happened during this particular execution try?

Example:

    Action A = UNKNOWN

    Attempt 1 = UNKNOWN

    Later reconciliation:

    Attempt 2 = SUCCEEDED

The Action can then become SUCCEEDED if the successful Attempt establishes the execution result.

The model must not collapse all attempts into a single mutable execution record.

---

## 11. Idempotency

Two distinct idempotency concepts are required.

### Action creation idempotency

Prevents duplicate logical Actions:

    UNIQUE (organization_id, idempotency_key)

where key is supplied.

### Attempt execution identity

Prevents duplicate consequential execution where the adapter/provider supports idempotency.

The execution identity belongs to the Attempt.

A transport retry MUST NOT create:

    Action A
    Action B

when both represent the same logical operation.

It should preserve:

    Action A
      ├── Attempt 1
      └── Attempt 2

Provider-specific idempotency keys belong to the adapter contract and should not be confused with Action creation idempotency.

---

## 12. Consequence classification

Do NOT create a mandatory large `consequence_class` enum in Migration 015.

The design requires authorization to be sensitive to operational consequence, but the first kernel does not yet have enough concrete execution scenarios to justify a permanent taxonomy.

When the first real execution adapter is selected, determine the minimum vocabulary required.

---

## 13. Action type

Do NOT create a giant Action type taxonomy.

The first implementation should introduce only the Action type(s) required by a concrete end-to-end operational scenario.

For example:

    INSPECT_ASSET
    CONTACT_CUSTOMER
    RESTART_DEVICE

These are examples only, not an approved enum.

The schema should avoid requiring dozens of speculative action types.

---

## 14. Target/reference model

Do not introduce a generic polymorphic target table yet.

For the first implementation, target/reference data should be constrained to the concrete Work Item subject/context already available.

Potential target references include:

- customer;
- site;
- asset;
- external system resource.

The exact representation should follow the first execution scenario.

A generic:

    target_type + target_id

pair is NOT automatically considered safe because it weakens referential integrity.

---

## 15. Evidence boundary

Neither `actions` nor `action_attempts` should contain operational truth fields such as:

- equipment_is_restored;
- service_is_resolved;
- customer_is_satisfied;
- fault_is_fixed.

Execution records may contain normalized execution results and references to resulting Evidence.

The relationship remains:

    Attempt
      ↓
    Evidence
      ↓
    Event
      ↓
    Verification

An execution result must never be treated as a shortcut to Situation resolution.

---

## 16. RLS and authorization

All three tables are tenant-scoped and should use:

- RLS enabled;
- FORCE RLS;
- organization-scoped SELECT;
- protected INSERT/UPDATE;
- no authenticated DELETE.

Authorization-sensitive transitions should be enforced through protected database functions/triggers, following the existing Work Item pattern.

Client-provided:

    organization_id
    requested_by_actor_id
    authorized_by_actor_id
    executor_actor_id

must not be treated as authorization evidence.

The authoritative tenant context comes from authenticated identity and active membership.

---

## 17. Foreign-key integrity

Required tenant-safe relationships:

    actions
      (organization_id, work_item_id)
          ↓
    work_items
      (organization_id, id)

and:

    action_attempts
      (organization_id, action_id)
          ↓
    actions
      (organization_id, id)

This preserves the same tenant-integrity pattern already used by Situation and Work Item.

---

## 18. Execution command boundary

The runtime boundary should be:

    Authorized Action
          ↓
    Execution Command
          ↓
    Adapter
          ↓
    Provider / Internal Operation
          ↓
    Attempt Result
          ↓
    Evidence

The Execution Command is not itself the Action.

A command is ephemeral application transport.

The Action is durable domain state.

The adapter owns provider-specific request/response mechanics.

No universal execution engine is introduced.

---

## 19. Proposed protected operations

The first implementation should expose a small set of domain operations rather than generic arbitrary mutations.

Conceptually:

    create_action()
    authorize_action()
    start_action_attempt()
    record_attempt_result()

Potential reconciliation operation:

    reconcile_unknown_attempt()

These are conceptual boundaries, not approved function names.

Each operation should enforce its own state and permission invariants.

---

## 20. What Migration 015 should NOT contain

Migration 015 must not introduce:

- Verification tables;
- generalized automation policies;
- AI authorization;
- provider-specific payment tables;
- universal integration tables;
- device-control framework;
- generic target registry;
- giant Action taxonomy;
- consequence taxonomy with speculative values;
- scheduler;
- workflow engine;
- route engine;
- marketplace;
- wallet;
- settlement;
- PCU;
- legacy execution primitives.

---

## 21. Implementation gate

Before Migration 015:

1. Select one concrete end-to-end execution scenario.
2. Prove the scenario fits Action + Attempt without semantic exceptions.
3. Freeze the minimum Action type required.
4. Freeze the minimum executor representation required.
5. Freeze the provider/external reference fields actually required.
6. Freeze the authorization operation.
7. Freeze the UNKNOWN reconciliation path.
8. Write authorization, tenant, retry, idempotency, and evidence-boundary tests.
9. Only then implement Migration 015.

The first scenario should be operational rather than financial or autonomous.

A suitable scenario is one where:

    Situation
      ↓
    Work
      ↓
    Authorized Action
      ↓
    External/Internal Execution
      ↓
    Attempt Result
      ↓
    Evidence
      ↓
    Verification

can be demonstrated end-to-end without introducing a second domain.

---

## 22. Design decision

The Action / Execution semantic gate is considered **architecturally coherent** against the existing V2 Work Item boundary.

No contradiction was found that requires reopening 009–014.

However, implementation remains gated on one concrete execution scenario.

**Migration 015 is still NOT authorized.**
