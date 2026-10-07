# Enerlectra — Ellie Organizational Intelligence Model

**Status:** Active architectural direction for PR #35 and subsequent product development  
**Date:** 2026-10-07  
**Branch:** `reconstruction/platform-identity-boundary`

## 1. Product decision

Ellie is not being built as a generic chatbot, a thin analytics assistant, or an unconstrained autonomous agent.

The target is:

> **Ellie is the organizational intelligence layer that learns how each business operates, helps people perform operations and make decisions, and progressively makes the business easier to run.**

The intelligence must be useful in ordinary business work:

- maintaining records;
- understanding customers;
- managing assets and inventory;
- coordinating people;
- following workflows;
- identifying exceptions;
- preparing operational summaries;
- supporting decisions;
- retrieving organizational knowledge;
- assisting communication;
- learning recurring operating patterns.

The same Ellie implementation must support materially different businesses without creating separate product silos for EPC, PAYGo, mini-grid, C&I, distributor, maintenance, EaaS, or other operating models.

---

## 2. The central concept: learn the organization's operating model

Tenant adaptation is broader than remembering facts.

Ellie should progressively understand:

### People and responsibility

- who performs which roles;
- who is responsible for what;
- which responsibilities are delegated;
- which approvals require particular permissions.

### Processes

- how work normally moves through the organization;
- which steps follow other steps;
- which tasks are mandatory;
- where handoffs occur;
- which exceptions require escalation.

### Resources

- customers;
- sites;
- assets;
- inventory;
- suppliers;
- contracts;
- payments;
- documents;
- operational records.

### Policies

- approval requirements;
- operational constraints;
- escalation rules;
- service standards;
- organization-specific procedures.

### Patterns

- recurring failures;
- recurring customer behavior;
- inventory consumption patterns;
- operational bottlenecks;
- seasonal or site-specific patterns;
- relationships between observations and verified outcomes.

### Preferences

- how managers prefer summaries;
- communication channels;
- scheduling conventions;
- reporting cadence;
- workflow preferences.

This produces an organizational operating model that Ellie can reason over.

---

## 3. The canonical intelligence loop

The long-term loop is:

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
Act
   ↓
Verify
   ↓
Learn
   ↓
Update organizational intelligence
   ↺
```

The current V2 operational kernel already supplies much of the evidence pipeline:

```
Identity
→ Actor
→ Membership
→ Organization
→ Operating Context
→ Resource
→ Evidence / Observation
→ Event
→ Situation
→ Recommendation
→ Work
→ Action
→ Verification
→ Audit
```

Ellie should become the intelligence layer operating across this kernel.

---

## 4. Knowledge must be separated by authority

Ellie must distinguish between information that belongs in canonical business records and information that belongs in organizational intelligence.

### 4.1 Canonical organizational facts

Examples:

- customer identity;
- customer contact information;
- asset identity;
- asset status;
- site location;
- inventory quantity;
- supplier;
- payment;
- contract;
- work item.

These belong in canonical domain resources.

Ellie retrieves and understands them. It should not maintain an independent competing copy of truth merely because an LLM has seen the information.

### 4.2 Organizational procedures

Examples:

```
When an inverter fault is reported:
→ create a FIELD_CHECK
→ assign an appropriate technician
→ perform the work
→ verify the result
→ resolve the situation
```

Procedural knowledge describes how that organization operates.

### 4.3 Organizational policies

Examples:

```
Payments above a defined threshold require OWNER approval.

Technicians cannot authorize financial actions.

Unresolved customer complaints escalate after the organization's defined period.
```

Policies remain authoritative platform/domain data. Ellie may interpret and explain them but cannot redefine authorization.

### 4.4 Organizational patterns

Patterns are learned from accumulated evidence and outcomes.

Example:

```
Equipment class X
+ repeated voltage anomaly
+ environmental condition Y
→ historically associated with failure within approximately 72 hours
```

A pattern is not automatically a policy or fact. It requires evidence, confidence, provenance and appropriate validation.

### 4.5 Organizational preferences

Examples:

- morning operational summaries;
- WhatsApp-first notifications;
- grouping technician work by location;
- highlighting unresolved issues before routine work.

Preferences make Ellie more useful without changing authorization or business truth.

---

## 5. Organizational intelligence is not generic AI memory

Do not implement Ellie as:

```
conversation
→ embedding
→ vector database
→ "AI memory"
```

and assume that this constitutes organizational intelligence.

The preferred model is:

```
Canonical business data
        +
Operational history
        +
Verified outcomes
        +
Organizational procedures
        +
Policies
        +
Validated patterns
        +
Preferences
        ↓
Organizational intelligence
        ↓
Ellie
```

The memory layer added in migration 050 is therefore a foundation, not the complete organizational knowledge system.

---

## 6. Learning authority

Ellie must not write permanent organizational truth simply because an LLM generated a statement.

The safe learning path is:

```
Observation / Evidence
        ↓
Situation
        ↓
Ellie reasoning
        ↓
Recommendation
        ↓
Work / Action
        ↓
Verification
        ↓
Outcome
        ↓
Learning signal
        ↓
Organizational memory / pattern
```

The stronger the claim, the stronger the evidence required.

Raw conversation may provide a lead or hypothesis.

Verified operational outcomes can provide learning evidence.

Canonical records remain the authoritative source for business facts.

---

## 7. Organizational memory model

The current `intelligence_memories` capability should evolve toward supporting multiple knowledge classes.

Conceptually:

```
intelligence
├── FACT / canonical reference
├── PROCEDURE
├── POLICY
├── PATTERN
├── PREFERENCE
└── OUTCOME_PATTERN
```

Not every class needs to be stored in the same table.

The architecture should avoid forcing canonical domain facts into AI memory simply because Ellie needs to retrieve them.

Memory should retain useful organizational knowledge that is:

- tenant-scoped;
- evidence-backed;
- confidence-aware;
- provenance-aware;
- temporally bounded where appropriate;
- capable of becoming stale;
- auditable;
- retractable or supersedable.

---

## 8. Tenant isolation remains absolute

Organizational intelligence is tenant-scoped by default.

```
Tenant A
  ↓
Tenant A operational evidence
  ↓
Tenant A organizational intelligence
  ↓
Tenant A Ellie context

Tenant B
  ↓
Tenant B operational evidence
  ↓
Tenant B organizational intelligence
  ↓
Tenant B Ellie context
```

There is no implicit cross-tenant learning.

A platform-wide knowledge layer may exist separately for genuinely universal information, such as:

- electrical engineering principles;
- equipment documentation;
- safety standards;
- regulatory knowledge;
- generally applicable technical knowledge.

Platform knowledge must be explicitly separated from tenant organizational memory.

---

## 9. Ellie should help run the business

The target user experience is not primarily:

> "Ask Ellie a question."

It is:

> "Ellie helps me understand and operate my business."

Examples include:

### Operations

> "What's happening today?"

Ellie should be able to summarize:

- open situations;
- urgent issues;
- overdue work;
- active technicians;
- pending actions;
- unresolved customer matters;
- operational exceptions.

### Customers

> "Which customers need attention?"

Ellie can identify:

- overdue work;
- unresolved complaints;
- payment exceptions;
- installation delays;
- recurring service problems.

### Inventory

> "Are we running low on anything?"

Ellie should combine inventory records with scheduled work and historical consumption where available.

### Records

> "Add this customer."

> "Record today's meter reading."

> "Attach this document to the site."

These are operational commands whose actual mutations must pass through canonical APIs and authorization.

### Decisions

> "What needs my attention first?"

> "Should we order more panels?"

> "Which sites are most at risk?"

Ellie should provide evidence, rationale and confidence rather than pretending certainty.

### Workflow

> "What hasn't been verified?"

> "Assign this job to Brian."

> "Follow up with the customer."

These should become canonical Work/Action operations subject to authorization.

---

## 10. Ellie must learn workflow structure, not just facts

A mature Ellie should gradually infer the organization's process graph.

For example:

```
Customer created
      ↓
Site assessed
      ↓
Quotation
      ↓
Installation
      ↓
Commissioning
      ↓
Maintenance
      ↓
Customer support
```

Another tenant may operate:

```
Customer
  ↓
PAYGo contract
  ↓
Device activation
  ↓
Payment monitoring
  ↓
Token issuance
  ↓
Default escalation
  ↓
Field recovery
```

Another:

```
Energy asset
  ↓
Production reading
  ↓
Revenue calculation
  ↓
Mobile-money payout
  ↓
Reconciliation
  ↓
Exception handling
```

These are not separate Ellies.

They are tenant-specific operating models consumed by the same intelligence layer.

---

## 11. Structured intelligence remains mandatory

Free-form LLM output is useful for conversation, but operational intelligence must increasingly produce structured results.

The preferred shape is:

```
request
  ↓
tenant context
  ↓
relevant organizational knowledge
  ↓
reasoning
  ↓
structured result
  ├── summary
  ├── rationale
  ├── evidence
  ├── confidence
  ├── recommendation
  ├── proposed work
  └── learning signal
```

Where an operation is requested:

```
Ellie
  ↓
proposed intent
  ↓
canonical API
  ↓
permission check
  ↓
policy check
  ↓
action
  ↓
attempt
  ↓
verification
```

Ellie never bypasses the platform authorization boundary.

---

## 12. The business becomes easier to run over time

The desired compounding effect is:

```
More operations
      ↓
More evidence
      ↓
More verified outcomes
      ↓
Better organizational knowledge
      ↓
Better contextual reasoning
      ↓
Better recommendations
      ↓
Less manual coordination
      ↓
More useful operations
```

This is the product's intelligence flywheel.

The goal is not merely to make Ellie more conversational.

The goal is to make the organization progressively easier to operate.

---

## 13. Architectural consequences

Future work on Ellie should prioritize:

1. canonical organizational knowledge retrieval;
2. operating-model representation;
3. procedure/workflow understanding;
4. inventory/customer/asset operational assistance;
5. structured decision support;
6. evidence-backed organizational patterns;
7. temporal validity and stale-memory handling;
8. explicit provenance for learned knowledge;
9. workflow/action assistance through canonical APIs;
10. tenant-isolation tests for every intelligence retrieval path.

Avoid:

- generic cross-tenant memory;
- LLM-owned business truth;
- hidden authorization inside prompts;
- autonomous mutation without canonical authorization;
- duplicate domain systems created solely to satisfy Ellie;
- separate AI products for each business model.

---

## 14. Product definition

The durable definition of Ellie is:

> **Ellie is Enerlectra's tenant-scoped organizational intelligence layer. It learns how each business operates from authorized organizational context and verified operational experience, maintains useful organizational knowledge, assists everyday work and decision-making, and progressively reduces the effort required to run the business.**

This definition supersedes a narrower interpretation of Ellie as only a recommendation engine or conversational assistant.

The current structured recommendation + learning-memory implementation is the first concrete slice of this larger architecture.

---

## 15. Relationship to PR #35

PR #35 establishes the foundation required for this model:

```
identity
→ tenant
→ operating context
→ evidence
→ situation
→ recommendation
→ work
→ action
→ verification
→ audit
```

The intelligence roadmap builds upward from that foundation.

It does not require replacing the canonical tenant boundary or creating a separate AI platform.

**Governing principle:**

> **Build one Enerlectra operational kernel and let Ellie learn the operating model of each organization on top of it.**
