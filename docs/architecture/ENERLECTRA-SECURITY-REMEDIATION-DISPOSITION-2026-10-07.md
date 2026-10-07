# Enerlectra Security Remediation / Disposition
**Date:** 2026-10-07  
**Status:** Active merge-gate record

## Result

The exact-head executable validation was rerun after the Ellie changes.

- `npm run ci`: PASS
- server typecheck: PASS
- test suite: PASS — 18 primary tests plus all configured boundary gates
- client typecheck: PASS
- client production build: PASS

The remaining dependency audit findings were independently rechecked rather than hidden.

## Remediated

`enerlectra-core` production dependency audit now reports **0 vulnerabilities** after a non-force `npm audit fix` in the validation environment.

No `--force` upgrade was used.

## Remaining root/client findings

The remaining findings are dominated by dependency trees that require major-version toolchain changes:

- root: Tailwind 3 dependency chain retains `braces` high severity and `postcss-selector-parser` moderate severity; npm's available fix requires Tailwind 4.
- client production dependencies: React Router 6 has two moderate advisories; npm's available fix requires React Router 7.
- root dependency graph also contains other moderate findings where the safe fix is not available within the current declared compatibility range.

These are **not silently classified as resolved**.

## Why no force upgrade was applied

The available automated fixes cross architectural/tooling boundaries:

- Tailwind 3 → 4 changes the CSS/PostCSS integration.
- React Router 6 → 7 changes routing APIs and requires application-level compatibility validation.

Applying `npm audit fix --force` would therefore violate the reconstruction rule against introducing unverified breaking changes merely to make the audit number green.

## Disposition

The remaining findings are a **merge gate**, not an ignored warning.

The correct next security slice is:

1. isolate build-only dependencies from the runtime dependency graph where possible;
2. upgrade Tailwind with a controlled CSS/PostCSS migration and full browser validation;
3. upgrade React Router with route/auth/onboarding/workspace regression coverage;
4. rerun root, client and integration audits;
5. only then close the security gate.

No production service has been cut over to the reconstruction branch as part of this work.
