# Ellie Intelligence Maturity — 2026-10-07

## Decision

Ellie is now being treated as a tenant-scoped operational intelligence system, not a generic chatbot.

The design target is:

```
identity
→ actor
→ membership
→ organization
→ operating context
→ authorized evidence
→ Ellie
→ recommendation
→ work/action
→ verification
→ learning signal
→ tenant memory
→ Ellie
```

## Tenant adaptation

Ellie receives a canonical `EllieContext` containing:

- actor and organization identity;
- permissions;
- operating model/context;
- enabled capabilities and their configuration;
- organization policies;
- operational evidence;
- situations;
- recommendations;
- work;
- verified organizational memories.

Business-model descriptors are contextual. They never grant authorization.

## Learning boundary

Ellie does not learn from arbitrary prompts or unverified claims.

Learning is produced from operational outcomes:

1. Ellie produces a structured recommendation.
2. The recommendation is persisted with its context snapshot.
3. A human/system workflow records an outcome.
4. Verified/failed outcomes become learning events.
5. A supported learning signal may reinforce tenant-scoped organizational memory.
6. Future Ellie requests retrieve only that organization's active memories.

The learning tables are:

- `intelligence_learning_events`
- `intelligence_memories`

Both are organization-scoped and RLS-protected. Client-side writes are intentionally not granted.

## Isolation invariant

There is no global tenant memory in this layer.

Every memory query is constrained by `organization_id`.

The server resolves Actor → Membership → Organization before intelligence retrieval.

Ellie never selects its own tenant and never receives authorization authority.

## Current implementation

- Structured Ellie inference is available through the canonical core boundary.
- Canonical intelligence route: `POST /api/intelligence/ellie`.
- Verified outcome route: `POST /api/intelligence/ellie/:recommendationId/feedback`.
- Recommendations persist the context snapshot and learning signal.
- Tenant memories are retrieved and injected into canonical Ellie context.
- Verified/failed outcomes can reinforce tenant memory.
- Existing action/verification authorization remains outside Ellie.

## Non-goals

This does not fine-tune the underlying LLM per tenant.

It also does not permit automatic self-training from raw conversations.

The model remains a shared reasoning engine; organizational knowledge is tenant-scoped runtime memory backed by evidence and verified outcomes.

## Validation status

The live V2 Supabase database has migration 050 applied successfully.

The two new tables have RLS enabled and one tenant-scoped read policy each.

The live database currently contains zero learning memories and zero learning events, which is expected: no artificial training data has been inserted.

Repository/runtime execution of the latest exact head still requires a reproducible CI/sandbox environment. GitHub Actions has not provided a usable execution result, so code-level implementation is not represented as a fresh CI pass.
