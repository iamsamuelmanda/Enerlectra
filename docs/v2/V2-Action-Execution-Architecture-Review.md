# V2 Action / Execution Architecture Review

## Review status

**Result: CONDITIONAL APPROVAL FOR SCHEMA REFINEMENT — NOT APPROVED FOR MIGRATION 015 YET**

The Action / Execution semantic design is directionally correct and preserves the critical separation between Work, authorization, execution, Evidence, Event, and Verification.

The review found several points that must be resolved before the database schema is frozen.

No code or database migration is introduced by this review.

---

## 1. Core semantic boundary — ACCEPTED

The distinction is sound:

- Work Item describes what needs to be accomplished.
- Action records the logical operational operation authorized for execution.
- Attempt records an actual execution try.
- Outcome records what is known about that attempt.
- Evidence records observations/results about reality.
- Event records normalized facts recognized by Enerlectra.
- Verification establishes whether the intended operational result actually occurred.

The authoritative chain is:

~~~text
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
~~~

---

## 2. First-class Action Attempts — ACCEPTED

The review confirms that action_attempts should be first-class.

A single logical Action can have multiple execution attempts, especially when external providers time out or return uncertain results.

Therefore:

~~~text
one Action ≠ one Attempt
~~~

The model must support:

~~~text
Action A
 ├── Attempt 1
 ├── Attempt 2
 └── Attempt 3
~~~

This preserves retry history and prevents accidental duplication of consequential operations.

---

## 3. Remove executor identity from the logical Action as authoritative execution state

The original design proposed executed_by_actor_id on actions.

This should not be the authoritative executor field.

An Action can have multiple Attempts and potentially different executors. Therefore the authoritative execution identity belongs on action_attempts.

Keep:

- requested_by_actor_id on Action;
- authorized_by_actor_id on Action;
- executor_actor_id on each Attempt.

The Action may expose a derived final executor for read models later, but it should not be the canonical execution record.

**Decision: change required before schema freeze.**

---

## 4. Action creation authority — MUST BE EXPLICIT

The design defines who may authorize an Action but does not yet sufficiently define who may create/propose one.

These are separate permissions:

~~~text
PROPOSE / CREATE
        ≠
AUTHORIZE
        ≠
EXECUTE
~~~

A Recommendation may lead to an Action proposal, but a Recommendation is not itself an Action.

Before Migration 015, the implementation contract must specify the creation authority.

Preferred initial rule:

- an authorized operational actor or trusted internal service may create a PROPOSED Action;
- creation never implies authorization;
- action.authorize remains a separate permission;
- the Action must be linked to an existing Work Item.

Whether a new action.create permission is necessary should be decided against the existing bounded permission vocabulary rather than added automatically.

**Decision: resolve during schema/security freeze.**

---

## 5. Authorization is a decision, not merely a timestamp — MUST BE STRENGTHENED

Authorization should be treated as an auditable decision.

At minimum the canonical Action record must preserve:

- who authorized;
- when;
- authorization context/reason;
- what consequence class was authorized;
- the Action version/state that was authorized.

An Action must not be materially changed after authorization in a way that silently changes what was approved.

Therefore the implementation must either:

1. freeze consequential fields after authorization; or
2. require re-authorization when consequential fields change.

The first option is preferable for the initial kernel.

**Decision: required invariant.**

---

## 6. Consequence-sensitive authorization — ACCEPTED, but bounded

The semantic model should retain:

- action_type;
- consequence_class;
- execution_target.

The first implementation must not become a generic policy engine.

Enerlectra should define bounded consequence semantics and use explicit permissions/policies rather than arbitrary user-authored executable rules.

**Decision: accepted.**

---

## 7. Action status model — MUST BE FROZEN MORE PRECISELY

Required minimum states:

~~~text
PROPOSED
AUTHORIZED
EXECUTING
SUCCEEDED
FAILED
EXECUTION_UNKNOWN
CANCELLED
~~~

Required transition discipline:

~~~text
PROPOSED → AUTHORIZED
PROPOSED → CANCELLED

AUTHORIZED → EXECUTING
AUTHORIZED → CANCELLED

EXECUTING → SUCCEEDED
EXECUTING → FAILED
EXECUTING → EXECUTION_UNKNOWN

EXECUTION_UNKNOWN → EXECUTING
EXECUTION_UNKNOWN → SUCCEEDED
EXECUTION_UNKNOWN → FAILED
EXECUTION_UNKNOWN → CANCELLED
~~~

A retry is a new Attempt under the same Action, not a new Action.

**Decision: required before implementation.**

---

## 8. Unknown execution is a first-class safety state — ACCEPTED

For consequential external operations:

~~~text
request sent
    ↓
timeout
    ↓
unknown
~~~

must not mean:

~~~text
timeout = safe to retry
~~~

The Action model must preserve uncertainty until later evidence resolves it.

**Decision: accepted and mandatory.**

---

## 9. Idempotency must exist at two levels — ACCEPTED

There are two different duplication problems.

### Logical Action duplication

The same intended operation is submitted twice.

Protection belongs to Action-level idempotency.

### Execution duplication

The same Attempt is transported/retried internally or against an external provider.

Protection belongs to Attempt-level execution idempotency.

Therefore:

~~~text
Action.idempotency_key
Attempt.execution_idempotency_key
~~~

must be treated as distinct concepts.

External provider idempotency should be recorded separately from Enerlectra's internal execution identity.

**Decision: accepted.**

---

## 10. Evidence must not be stored as execution outcome truth — ACCEPTED

The Action design correctly preserves:

~~~text
Execution result
    ↓
Evidence
    ↓
Event
    ↓
Verification
~~~

Do not add a shortcut such as:

~~~text
action.status = SUCCEEDED
    ⇒
equipment.status = HEALTHY
~~~

That would collapse execution semantics into operational truth.

**Decision: accepted.**

---

## 11. Action success must not complete Work — ACCEPTED

A successful Action means the Action executed successfully.

It does not mean:

- the Work Item is complete;
- the Situation is resolved;
- the customer's problem is fixed.

Those remain separate state transitions requiring their own evidence and rules.

**Decision: accepted.**

---

## 12. Action history should be append-only — REQUIRED

The proposed action_history concept is appropriate.

The database should not allow an authenticated client to manufacture or rewrite execution history.

History should be produced by controlled database/service mechanisms in the same pattern already established for Situation and Work Item history.

Required history includes at least:

- Action created/proposed;
- authorized;
- execution started;
- execution completed;
- execution failed;
- execution became unknown;
- cancelled;
- Attempt created;
- Attempt result changes where operationally significant.

The exact history event vocabulary can be smaller than the full execution event vocabulary.

---

## 13. Tenant integrity — ACCEPTED

The Action and Attempt must carry direct organization_id.

Required relationship:

~~~text
Action.organization_id
      =
WorkItem.organization_id
      =
Attempt.organization_id
~~~

All subject references must remain tenant-consistent.

The authorization actor and executor must be valid for the Action's organization, unless execution is explicitly attributed to a trusted internal system identity.

External provider references never establish tenant authority.

---

## 14. AI boundary — ACCEPTED

The review confirms:

~~~text
Ellie
  ↓
Recommendation
  ↓
Authorization
  ↓
Action
  ↓
Execution
~~~

Ellie must not cross the authorization boundary merely because an Action appears obvious or urgent.

No autonomous execution is introduced by Migration 015.

---

## 15. Command infrastructure — REUSE WITH ADAPTER BOUNDARY

Existing command/workflow infrastructure contains reusable metadata and transport primitives:

- actor ID;
- organization ID;
- correlation ID;
- causation ID;
- execution context;
- command routing.

However, those constructs remain application/infrastructure concepts.

The V2 Action domain must not become a thin rename of the legacy Command model.

The correct relationship is:

~~~text
Application Command
       ↓
Action application service
       ↓
Persistent Action
       ↓
Execution Adapter
       ↓
Attempt
~~~

A Command may request an Action operation, but the Command itself is not the Action.

---

## 16. Existing V2 schema freeze inconsistency — FLAGGED

The existing cross-slice schema-freeze document lists:

- situation_assignments;
- work_evidence;
- actions;
- verifications.

The implemented Work Item gate instead uses:

- assigned_actor_id directly on work_items;
- no work_evidence table.

This is not an Action defect, and Work Item 009–014 remains frozen as instructed.

The schema-freeze documentation should eventually be reconciled so it does not describe entities that the actual frozen implementation deliberately does not use.

**Decision: documentation cleanup later; do not reopen Work Item migrations.**

---

## 17. Recommended minimal schema direction

This is still a proposal.

### actions

~~~text
id
organization_id
work_item_id
action_type
consequence_class
status
requested_by_actor_id
authorized_by_actor_id
requested_at
authorized_at
started_at
completed_at
idempotency_key
target
metadata
authorization_metadata
created_at
updated_at
~~~

### action_attempts

~~~text
id
organization_id
action_id
attempt_number
status
executor_actor_id
executor_type
execution_idempotency_key
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
metadata
created_at
~~~

### action_history

~~~text
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
~~~

Migration 015 should be written only after the exact fields, constraints, permissions, and transition triggers are reviewed.

---

## 18. Review verdict

### Accepted

- Action is distinct from Work.
- Action is distinct from Command.
- Action is distinct from Authorization.
- Action Attempts are first-class.
- Retries remain under one logical Action.
- Unknown execution is distinct from failure.
- Evidence remains separate from execution result.
- Execution does not assert operational resolution.
- Action success does not complete Work.
- Work completion does not resolve Situation.
- Ellie cannot bypass authorization.
- Tenant isolation applies to Action and Attempt.
- Legacy V1 execution concepts remain quarantined.

### Must resolve before Migration 015

1. Exact Action creation authority.
2. Whether an action.create permission is needed.
3. Consequential-field immutability/re-authorization rule.
4. Exact Action state-transition matrix.
5. Exact Attempt state-transition matrix.
6. Action-level vs Attempt-level idempotency semantics.
7. Final minimal schema and constraints.
8. Exact history vocabulary and trigger/service ownership.
9. Trusted system executor representation.
10. Reconciliation of the older schema-freeze documentation without reopening Work Item 009–014.

### Not approved yet

**Migration 015 is not yet approved.**

The design has passed conceptual review but needs one final **Action Security + State-Machine Freeze** before implementation.

No database changes should be made until that freeze is accepted.
