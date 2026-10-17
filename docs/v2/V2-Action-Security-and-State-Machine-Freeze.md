# V2 Action / Execution Security and State-Machine Freeze

## Status

**FROZEN — APPROVED AS THE DESIGN GATE FOR MIGRATION 015**

This document resolves the remaining Action / Execution design questions identified by the architectural review. It authorizes schema implementation work for Migration 015 only; it does not itself change the database.

Enerlectra remains one application. Action / Execution is part of the same V2 operational kernel.

## 1. Semantic boundary

The canonical distinction is:
- Work Item — what needs to be accomplished.
- Action — the logical operational operation proposed and, after authorization, eligible for execution.
- Authorization — the auditable decision permitting the Action to execute.
- Attempt — one actual execution try for the Action.
- Execution result — what is known about that Attempt.
- Evidence — observations/results about operational reality.
- Event — a normalized fact recognized by Enerlectra.
- Verification — evidence-based confirmation of the intended operational result.

Recommendation / Intent → Action proposal → Authorization → Action → Execution Attempt(s) → Execution Result → Evidence → Event → Verification → Work / Situation update.

An Action is not a Command, Recommendation, Authorization, Attempt, Evidence, Event, Verification, or Work completion.

## 2. Action creation authority

Action creation is a distinct authority from authorization and execution.

The V2 permission vocabulary gains:
- action.create — may create a proposed Action within the actor's organization and permitted operational context.
- action.authorize — may authorize a consequential Action.

Rules:
1. Creating an Action always creates it as PROPOSED.
2. Creation never authorizes the Action.
3. action.create never implies action.authorize.
4. action.authorize never implies permission to create arbitrary Actions.
5. Execution is permitted only for an authorized Action.
6. Server-side trusted execution adapters may execute an authorized Action without pretending to be a human actor.
7. Authorization must never be inferred from role names, channel identity, recommendation output, webhook payloads, or external provider references.

Role-to-permission assignment for action.create remains an explicit authorization configuration decision and must not be hard-coded into the Action state machine.

## 3. Authorization is an auditable decision

Authorization is a durable decision, not merely a timestamp.

At authorization time preserve at minimum:
- authorized actor;
- authorization timestamp;
- Action identity;
- Action version/state being authorized;
- authorization reason/context;
- consequence class;
- consequential target/reference context.

After an Action enters AUTHORIZED, consequential fields are immutable: target, action type, consequence class, Work Item association, requesting actor, and idempotency identity.

If the intended operation changes materially, create a new Action. Do not mutate an authorized Action and silently re-authorize it.

No in-place re-authorization is part of Migration 015.

## 4. Exact Action state machine

PROPOSED → AUTHORIZED or CANCELLED

AUTHORIZED → EXECUTING or CANCELLED

EXECUTING → SUCCEEDED, FAILED, or EXECUTION_UNKNOWN

EXECUTION_UNKNOWN → EXECUTING, SUCCEEDED, FAILED, or CANCELLED

Terminal states are SUCCEEDED, FAILED, and CANCELLED.

EXECUTION_UNKNOWN is deliberately non-terminal because the system may later reconcile the result or perform another controlled attempt.

EXECUTION_UNKNOWN → EXECUTING is allowed only when a new Attempt is created.

EXECUTION_UNKNOWN → SUCCEEDED/FAILED may occur when an existing uncertain execution is later reconciled without issuing another execution.

Cancellation means no further execution of that Action. It does not erase or reverse an already-issued external side effect.

## 5. Exact Attempt state machine

CREATED → EXECUTING or CANCELLED

EXECUTING → SUCCEEDED, FAILED, or EXECUTION_UNKNOWN

Terminal Attempt states are SUCCEEDED, FAILED, EXECUTION_UNKNOWN, and CANCELLED.

An Attempt never becomes another Attempt. A retry is represented by a new Attempt under the same Action.

Example: Action A → Attempt 1 UNKNOWN → Attempt 2 FAILED → Action FAILED.

The system must not convert an uncertain Attempt into a successful Attempt merely because a later retry succeeded.

## 6. Actor and executor identity

Authoritative identity fields are separated.

Action contains requested_by_actor_id and authorized_by_actor_id. It does not contain an authoritative executed_by_actor_id.

Attempt contains executor_actor_id when execution is performed by a human actor, plus executor_type.

Initial executor types are HUMAN and SYSTEM.

For SYSTEM execution, executor_actor_id may be null. The Attempt must instead retain a trusted server-side execution principal/adapter identifier in execution metadata.

A provider-supplied identity is never treated as a platform authorization identity.

## 7. Idempotency

There are two distinct idempotency layers.

Logical Action idempotency: actions.idempotency_key prevents duplicate logical Actions within the organization.

Execution Attempt idempotency: action_attempts.execution_idempotency_key prevents duplicate execution requests for one Attempt/transport operation.

External provider idempotency keys, when supported, are recorded separately from Enerlectra's internal identity.

An unknown result must not be blindly retried merely because a transport request timed out.

## 8. Minimal schema freeze

### actions

id, organization_id, work_item_id, action_type, consequence_class, status, requested_by_actor_id, authorized_by_actor_id, requested_at, authorized_at, started_at, completed_at, idempotency_key, target, metadata, authorization_metadata, created_at, updated_at.

Constraints must enforce direct tenant ownership, same-tenant Action → Work Item relationship, bounded action type/consequence class, valid state transitions, authorization-field consistency, authorized-field immutability, organization-scoped logical idempotency, and lifecycle timestamp consistency.

### action_attempts

id, organization_id, action_id, attempt_number, status, executor_actor_id, executor_type, execution_idempotency_key, started_at, finished_at, external_system, external_reference, request_reference, response_reference, result_code, result_summary, error_code, error_summary, correlation_id, causation_id, metadata, created_at.

Constraints must enforce direct tenant ownership, same-tenant Action relationship, unique positive attempt number per Action, valid Attempt transitions, valid HUMAN executor membership, trusted SYSTEM execution, timestamp consistency, and execution-idempotency uniqueness.

### action_history

id, organization_id, action_id, event_type, previous_status, new_status, actor_id, reason, correlation_id, occurred_at, metadata.

History is append-only and client-write-prohibited.

## 9. History vocabulary

Minimum Action history events:
- ACTION_PROPOSED
- ACTION_AUTHORIZED
- ACTION_EXECUTING
- ACTION_SUCCEEDED
- ACTION_FAILED
- ACTION_EXECUTION_UNKNOWN
- ACTION_CANCELLED
- ATTEMPT_CREATED
- ATTEMPT_SUCCEEDED
- ATTEMPT_FAILED
- ATTEMPT_UNKNOWN
- ATTEMPT_CANCELLED

The history mechanism is server/trigger controlled. Authenticated clients may receive read access according to the future Action permission boundary but cannot insert, update, or delete history directly.

Execution lifecycle history is not a substitute for domain Events.

## 10. Permission boundary

work.execute may perform permitted Work-level operations.

action.create may propose an Action.

action.authorize may authorize a consequential Action.

An authorized Action may enter execution.

Trusted execution services or authorized executors create and update Attempts.

Migration 015 must not make work.execute equivalent to Action authorization.

The exact role grants for action.create and action.authorize are separate authorization configuration and must be verified against real operational scenarios before deployment.

## 11. AI boundary

Ellie remains outside authorization and execution authority.

Ellie → Recommendation / Intent → Action proposal → Human or explicitly authorized policy boundary → Authorization → Execution.

Ellie cannot self-authorize, create an implicitly authorized Action, bypass action.authorize, directly mutate Action execution state, declare operational recovery, or complete Work merely because execution succeeded.

## 12. Evidence and domain truth

Execution results remain execution facts.

Example: Action restart inverter → provider accepted request → execution result → observation/evidence → action.execution_succeeded.

This does not establish equipment.reporting_restored. That domain Event requires appropriate Evidence and domain recognition. Verification remains separate.

## 13. Tenant security invariants

Migration 015 must enforce:
1. Action.organization_id = WorkItem.organization_id.
2. Attempt.organization_id = Action.organization_id.
3. Referenced actors are same-tenant unless explicitly represented as trusted system execution.
4. Cross-tenant Action reads are denied.
5. Cross-tenant Action creation is denied.
6. Cross-tenant authorization is denied.
7. Cross-tenant Attempt creation/update is denied.
8. External IDs/references cannot establish tenant authority.
9. Channel identity cannot establish tenant authority.
10. AI retrieval and execution context must carry verified tenant context.
11. No browser/client path receives a service-role execution capability.
12. Action history cannot be altered by authenticated clients.

## 14. Implementation gate for Migration 015

Migration 015 may be implemented only with actions, action_attempts, and action_history; direct organization_id on all three; composite same-tenant foreign keys; RLS enabled and forced; explicit tenant-scoped policies; bounded permissions; exact state-transition enforcement; append-only history enforcement; Action and Attempt idempotency constraints; trusted system executor representation; and no autonomous execution path.

Required tests:
1. unauthorized actor cannot authorize;
2. actor without action.create cannot propose;
3. proposed Action cannot execute;
4. authorized Action can enter execution;
5. invalid Action transitions fail;
6. invalid Attempt transitions fail;
7. authorized Action fields cannot be changed;
8. new Attempt preserves logical Action identity;
9. duplicate Action idempotency is rejected;
10. duplicate Attempt execution idempotency is rejected;
11. unknown execution remains distinct from failure;
12. unknown Action can be reconciled without inventing a second execution;
13. retry creates a new Attempt;
14. cross-tenant Action visibility/write/authorization is denied;
15. inactive actor cannot execute as HUMAN;
16. trusted SYSTEM execution cannot be impersonated by a client;
17. Action success does not complete Work;
18. execution success does not create operational recovery without Evidence/Verification;
19. Action history cannot be client-mutated;
20. Ellie recommendation cannot authorize or execute.

Tests must use real authenticated tenant boundaries where applicable.

## 15. Explicit non-scope

Migration 015 does not authorize generic workflow engines, autonomous AI execution, generic plugin execution, remote-device-control frameworks, payment ledgers, wallets, settlement, PCU, marketplace, blockchain execution, procurement, inventory, schedulers, automatic Work completion, automatic Situation resolution, or separate EPC/PAYGo Action models.

## 16. Decision

**Action / Execution semantic security and state-machine design is frozen.**

Migration 015 is now the next implementation gate.

The implementation must follow this document rather than the earlier provisional Action schema. Work Item migrations 009–014 remain frozen and must not be modified unless a concrete defect is discovered.