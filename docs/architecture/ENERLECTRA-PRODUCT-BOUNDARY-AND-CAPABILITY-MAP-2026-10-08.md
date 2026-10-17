# Enerlectra Product Boundary & Capability Map
## 2026-10-08

### Purpose

This document is the product-boundary authority for the reconstruction branch. Enerlectra is one platform: **operational intelligence infrastructure for energy-facing businesses**.

Operating models such as EPC, PAYGo, mini-grid, C&I, distributor, maintenance and EaaS are configurations/capabilities within the same platform. They are not separate Enerlectra products or architecture versions.

### Customer-evidence test

A capability earns a place in the current platform only when it:

1. solves a demonstrated operational problem for an energy-facing organization;
2. supports a concrete operational job;
3. operates on an authoritative canonical resource;
4. remains inside the canonical tenant/authorization boundary; and
5. produces evidence that can be verified.

The target operational loop is:

**signal → identify customer/site/asset → investigate → coordinate → act → evidence → verify → learn**

### Evidence → operational job → capability → canonical domain → intelligence

| Evidence | Operational job | Required capability | Canonical domain | Intelligence requirement |
|---|---|---|---|---|
| Solar Move customer faults arrive through random staff/WhatsApp channels | Route and resolve customer issues | Issue intake, customer/site/asset resolution, work assignment | Situation → Work → Action → Verification | Detect priority, recurrence and unresolved ownership |
| Renwasol payment → token failures | Restore service after payment/token exception | Payment evidence, reconciliation, exception handling, communication | Evidence → Situation → Work → Verification | Connect payment failure to customer/service outcome |
| DS Solar inverter/battery faults | Diagnose and coordinate field service | Asset history, maintenance, technician work, evidence capture | Asset → Situation → Work → Action → Verification | Compare current fault with verified service history |
| Manual Excel inventory/collections | Maintain operational state across fragmented records | Inventory/collections capability and evidence adapters | Resource → Evidence → Work | Detect missing, overdue or inconsistent operational state |
| WhatsApp/phone/spreadsheets fragmentation | Give operators one operational picture without forcing immediate system replacement | Channel/adapters, canonical context, audit | Evidence → Situation → Work | Correlate signals across sources |

### Current subsystem disposition

| Subsystem | Disposition | Boundary |
|---|---|---|
| Identity / actor / membership / organization | CORE | Canonical kernel |
| Tenant resolver / authorization | CORE | Canonical kernel |
| Customer / site / asset records | CORE | Canonical resources |
| Operational issue / situation | CORE | Canonical operational state |
| Work / Action / Attempt | CORE | Execution kernel |
| Verification / audit | CORE | Truth boundary |
| Evidence / event infrastructure | CORE | Intelligence input |
| Ellie context / recommendation / learning | CORE | Intelligence layer |
| Meter reading validation | CAPABILITY | Meter/reading evidence |
| OCR | CAPABILITY | Evidence ingestion |
| Image/fraud fingerprinting | CAPABILITY | Evidence validation |
| Payment reconciliation | CAPABILITY / HIGH PRIORITY | Payment evidence → exception workflow |
| Lenco / mobile-money adapters | CAPABILITY / HIGH PRIORITY | External payment adapter |
| Maintenance / field service | CAPABILITY / HIGH PRIORITY | Asset → Work → Verification |
| Customer support / communications | CAPABILITY / HIGH PRIORITY | Signal → Situation → communication |
| Inventory | CAPABILITY | Resource/evidence/work capability |
| Supplier workflows | CAPABILITY | Work + supplier resource integration |
| Monitoring adapters | CAPABILITY | External signal ingestion |
| PCU / token economy | FUTURE | Isolated; cannot define kernel |
| Marketplace / matching | FUTURE | Isolated; no current ICP requirement |
| Staking | FUTURE | Isolated; no current ICP requirement |
| Blockchain settlement | FUTURE | Isolated; no current ICP requirement |
| Cluster economics / ownership shares | FUTURE | Isolated; not required by current operating jobs |
| Energy trading | FUTURE | Isolated; no current ICP requirement |
| Universal financial ledger / settlement lifecycle | FUTURE | Isolated unless a demonstrated operational job requires a specific capability |
| Experimental AI/research | EXPERIMENTAL | Must not become authorization or canonical truth |
| Duplicate legacy tenant/auth/runtime paths | UNJUSTIFIED | Remove from active architecture |

### Ellie knowledge boundary

Ellie must distinguish:

- **FACT** — authoritative canonical record; retrieve it, do not invent a competing fact.
- **PROCEDURE** — demonstrated organizational way of working.
- **POLICY** — authoritative organizational rule.
- **PATTERN** — repeated, evidence-backed operational behavior.
- **PREFERENCE** — operator/organization preference.
- **OUTCOME** — result of a particular recommendation or case.

A verified recommendation outcome is **not** automatically a procedure or pattern. Pattern promotion requires explicit evidence review.

### Ellie learning invariants

1. Learning is tenant-scoped.
2. Learning writes occur server-side.
3. VERIFIED outcomes require a canonical verification.
4. FAILED outcomes are counter-evidence.
5. Evidence references must exist in the supplied canonical context or be the verification used for the outcome.
6. Recommendations must explicitly identify their target situation/resource or remain unattached.
7. No recommendation may silently attach to the first open situation.
8. Memory validity is temporal; stale knowledge must not be treated as current truth.
9. Counter-evidence reduces confidence and can retire a memory.
10. Pattern promotion is controlled and requires repeated, strong, non-contradicted evidence.

### Architecture consequence

The old product model is not deleted merely because it is old. It is **removed from architectural influence** unless current customer evidence earns it a place in the CORE or CAPABILITY boundary.

The platform therefore converges around:

**Identity → Organization → Resource → Evidence → Situation → Recommendation → Work → Action → Verification → Audit → Learning**

and not around historical economic or token primitives.

### Implementation gate

The architecture is considered aligned only when code, database schema, authorization, intelligence semantics and validation all enforce these boundaries. Documentation alone is not proof.
