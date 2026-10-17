# Enerlectra — Ellie Organizational Intelligence Contract
**Status:** Active architecture authority
**Date:** 2026-10-07

## Definition

Ellie is Enerlectra's tenant-scoped organizational intelligence layer.

> Ellie should not remember what was said. Ellie should learn what the organization has demonstrated.

Ellie is not:
- a tenant authority;
- an authorization engine;
- a source-of-truth database;
- a generic chatbot;
- an autonomous executor.

## Intelligence loop

```
Observe
  ↓
Understand
  ↓
Remember
  ↓
Predict
  ↓
Recommend
  ↓
Assist
  ↓
Act through canonical APIs
  ↓
Verify
  ↓
Learn
```

The first production slice is deliberately bounded:
- authoritative canonical records;
- operational evidence;
- open situations/work/actions;
- verified outcomes;
- bounded organizational knowledge.

## Five epistemic levels

### 1. FACT

A canonical fact about the organization:
- customer identity;
- site;
- asset;
- contract/reference;
- current status.

Facts remain in canonical tables. Ellie retrieves them. Ellie does not replace them with memories.

### 2. PROCEDURE

A demonstrated organizational way of doing work:
> "For this fault class, the organization normally performs A → B → C."

A procedure requires repeated verified evidence and explicit promotion. One successful recommendation is not a procedure.

### 3. POLICY

Authoritative organizational rules:
- approval thresholds;
- responsibility restrictions;
- operating constraints.

Policies come from canonical policy/configuration records. Ellie can explain them but cannot rewrite or bypass them.

### 4. PATTERN

A repeated operational relationship supported by multiple verified outcomes:
> "This asset/fault/payment condition repeatedly correlates with this resolution."

Patterns are learned, scoped and revisable.

### 5. PREFERENCE

A stable human/organizational preference:
- reporting cadence;
- preferred communication channel;
- presentation style.

Preferences must not override policy or authorization.

### Outcome is not doctrine

A verified recommendation establishes an **outcome**:

> "This recommendation worked in this case."

It does not automatically establish:
- a procedure;
- a policy;
- a general pattern.

The implementation therefore stores first verified learning as `OUTCOME`. Repeated verified occurrences may promote the knowledge to `PATTERN`.

## Memory provenance contract

Every promoted memory should carry:
- tenant;
- knowledge type;
- statement;
- canonical resource references;
- evidence references;
- evidence strength;
- confidence;
- occurrence count;
- contradiction count;
- first observed;
- last confirmed;
- optional validity interval;
- status;
- optional supersession.

Failed verification is counter-evidence.

Counter-evidence:
- records the learning event;
- increments contradiction count on matching knowledge;
- reduces confidence;
- can retire the knowledge;
- never creates a new organizational fact by itself.

## Retrieval contract

Memory retrieval is structured before it is semantic:

1. tenant;
2. active lifecycle;
3. temporal validity;
4. knowledge type;
5. resource scope;
6. evidence strength;
7. full-text relevance;
8. confidence/recency/contradiction ranking.

Vector/embedding retrieval is an optional later layer, not a prerequisite for correctness.

## Context contract

Ellie receives an already-authorized context containing:

```
trusted actor
+
organization
+
permissions
+
operating context
+
capabilities
+
policies
+
customer/site/asset context allowed by permission
+
situations
+
work
+
actions/attempt evidence
+
recommendations
+
verified learning
+
organizational attention snapshot
```

Ellie never decides which tenant data it is allowed to retrieve.

## Recommendation contract

Every recommendation must explicitly identify:
- recommendation type;
- target situation, or explicitly no target;
- target resource IDs where applicable;
- evidence IDs used;
- rationale;
- confidence;
- optional bounded work proposal;
- optional learning signal.

Server-side semantic validation must reject:
- unknown evidence IDs;
- unknown target situations;
- unknown target resource IDs;
- target resources unrelated to the selected target situation;
- unsupported recommendation types;
- invalid confidence.

The server must never attach a recommendation to `situations[0]` merely because it exists.

## Execution contract

```
Ellie recommendation
      ↓
canonical work
      ↓
Action proposal
      ↓
actor permission + responsibility scope
      ↓
authorization
      ↓
attempt
      ↓
result evidence
      ↓
verification
      ↓
learning event
```

Ellie cannot authorize, execute or verify an action.

Learning feedback is accepted only when the referenced verification belongs to the same tenant and situation and its authoritative verification status matches the learning outcome (`VERIFIED` → `VERIFIED`, `FAILED` → `FAILED`).

## Operational attention

Ellie should eventually move from:

> "Ask Ellie."

toward:

> "Ellie understands what is happening in your operation."

That means the system should be able to surface:
- unresolved customer issues;
- payment/token exceptions;
- recurring technical faults;
- overdue/unassigned work;
- cases waiting for verification;
- recurring patterns supported by verified history.

The current context builder therefore includes bounded customer/site/asset detail where the actor has the corresponding read permission, plus operational situations/work/actions and an expanded organizational attention snapshot.

Additional payment, inventory, supplier, communication and document contexts are attached through capabilities as those canonical resource models are implemented; they are not invented as AI facts.

## Reliability hierarchy

When sources disagree:

1. canonical records;
2. verified evidence;
3. organizational knowledge with provenance;
4. unverified observations;
5. model inference.

A lower layer never silently overrides a higher layer.

## Architectural consequence

Ellie is not a separate product.

It is the intelligence layer operating over Enerlectra's single operational kernel.
