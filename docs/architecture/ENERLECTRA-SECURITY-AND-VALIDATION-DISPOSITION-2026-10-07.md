# Enerlectra Security and Validation Disposition — 2026-10-07

## Database security

- Migration 052 adds bounded organizational-knowledge provenance and structured retrieval indexes.
- Migration 053 revokes direct `PUBLIC`/`authenticated` execution of the four onboarding/ownership SECURITY DEFINER functions and grants execution to `service_role` only.
- Supabase security advisor now reports only one INFO finding: `organization_invitations` has RLS enabled with no policy. This is intentional deny-by-default because invitation lifecycle is server-side; it is not a warning-level execution finding.

## Application dependency security

The repository still has npm audit findings. These are a separate dependency-remediation track from the architectural changes.

Current exact-head executable validation shows application CI passes, while the dependency audit remains non-zero. The remaining findings include packages in the legacy/build dependency graph (notably Tailwind v3's unresolved `braces` chain) and runtime packages such as Axios, compression, sharp, ethers, uuid and related transitive packages.

Do not use `npm audit fix --force` as a blind fix: the current Tailwind v3 finding requires a Tailwind v4 major upgrade according to npm audit, which is a product/build-tool migration rather than a safe patch. Dependency upgrades must be tested against the canonical runtime and lockfile.

## Merge disposition

- Database security warnings requiring action: resolved.
- Exact-head application typecheck/tests/build: passed independently.
- Dependency audit: **not clean** and remains a merge gate until either patched lockfile upgrades are validated or each remaining finding has an explicit, evidence-backed risk disposition and isolation plan.
- No production cutover to the reconstruction branch is authorized by this document.