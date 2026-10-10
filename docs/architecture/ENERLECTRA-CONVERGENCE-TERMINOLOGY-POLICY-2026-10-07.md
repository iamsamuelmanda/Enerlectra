# Enerlectra Convergence Terminology Policy — 2026-10-07

PR #35 is a convergence of one Enerlectra codebase. It is not a second product/runtime.

## Canonical language

- Enerlectra = one multi-tenant operational-intelligence platform.
- `enerlectra-core` = shared Enerlectra domain/infrastructure code; it is not a legacy product by definition.
- Ellie = tenant-scoped organizational intelligence layer.
- Operating models = configuration/capability context, not product silos.
- Supabase/Render/Vercel = canonical infrastructure surfaces for the same platform.

## Historical language

Older `docs/v2/*` documents and `supabase/v2/migrations/*` paths are retained where changing them would damage migration/history integrity. They are historical reconstruction records, not instructions to deploy a parallel V2 runtime.

New code and runtime configuration must not introduce:

- `V2_SUPABASE_*` environment variables;
- a second Supabase client for the canonical Action/tenant path;
- a second production Enerlectra service;
- V1/V2 product routing;
- separate EPC/PAYGo/etc. application boundaries.

Migration filenames are immutable historical identifiers. Their contents may be documented as superseded where necessary, but runtime code must use canonical configuration.

## Required invariant

One request → one canonical tenant resolver → one organization-scoped operational kernel → one authorization boundary → one verification/audit trail.