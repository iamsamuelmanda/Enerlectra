# Enerlectra V2 — Operating Model Validation Matrix

**Status:** Architecture validation gate  
**Date:** 2026-09-21  
**Market lens:** Lusaka-first distributed-energy operations

## 1. Objective

Validate that the proposed Enerlectra operating model can represent materially different distributed-energy organizations using one operational kernel, without creating EPC/PAYGo-specific schemas or hard-coding job titles into authorization.

This is a design validation exercise, not a claim that these operating patterns have all been commercially validated.

## 2. Validation dimensions

Each pattern is tested across:
- activities;
- customer segments;
- asset ownership;
- service responsibility;
- payment context;
- operational capabilities;
- responsibility scope;
- operational exception;
- work;
- consequential action;
- verification.

## 3. Pattern A — Installation / Service Operator

Example profile: INSTALLATION + MAINTENANCE + CUSTOMER_SUPPORT; segments SME/COMMERCIAL/INSTITUTIONAL; ownership CUSTOMER_OWNED/FINANCED; service INSTALLATION/WARRANTY/O_AND_M/FIELD_SERVICE; payment CONTRACT/RECURRING.

Representative exception: customer reports an inverter is not working.

Operational path: Observation -> Event -> Situation -> Work -> Action -> Attempt -> Evidence -> Verification.

Required context: affected site/asset, warranty/service responsibility, responsible field scope, previous related incidents, assigned actor/team.

Result: **Representable by the common kernel.**

## 4. Pattern B — PAYGo / Recurring-Service Operator

Example profile: FINANCING + CUSTOMER_SUPPORT + MAINTENANCE; segments RESIDENTIAL/SME; ownership FINANCED/ORGANIZATION_OWNED; service WARRANTY/O_AND_M/CUSTOMER_SUPPORT/REMOTE_MONITORING; payment PAYGO/RECURRING; capabilities include COLLECTIONS and PAYMENT_RECONCILIATION.

Representative exception: payment was received but service/account state appears inconsistent.

Operational path: payment observation -> event -> situation -> reconciliation work -> consequential action where required -> evidence -> verification.

Important boundary: the common kernel can represent the operational exception now. A dedicated financial ledger/payment domain should only be introduced when the pilot requires it.

Result: **Representable by the common kernel without a PAYGo-specific product.**

## 5. Pattern C — C&I / Portfolio Operator

Example profile: ENERGY_GENERATION + ENERGY_SERVICE + MAINTENANCE; segments COMMERCIAL/INDUSTRIAL/INSTITUTIONAL; ownership ORGANIZATION_OWNED/CUSTOMER_OWNED; service O_AND_M/REMOTE_MONITORING/FIELD_SERVICE; payment CONTRACT/RECURRING.

Representative exception: site performance or equipment condition requires investigation.

Operational path: Observation -> Event -> Situation -> Investigation Work -> Action -> Attempt -> Evidence -> Verification.

Potential future gap: telemetry/performance-specific observations may become a capability later. They should not be universal infrastructure before demand is demonstrated.

Result: **Representable by the common kernel.**

## 6. Pattern D — Distributor / Equipment-Service Organization

Example profile: DISTRIBUTION + CUSTOMER_SUPPORT + MAINTENANCE; ownership may be CUSTOMER_OWNED/ORGANIZATION_OWNED/THIRD_PARTY_OWNED; service WARRANTY/CUSTOMER_SUPPORT/FIELD_SERVICE; payment CASH/CONTRACT/MIXED.

Representative exception: customer reports equipment defect and requests warranty service.

Operational path: Observation -> Event -> Situation -> Inspection Work -> Action -> Evidence -> Verification -> Warranty outcome.

Required context: equipment identity, ownership, warranty responsibility, customer, service scope, inspection result.

Result: **Representable by the common kernel.**

## 7. Pattern E — Maintenance / Field-Service Organization

Example profile: MAINTENANCE + CUSTOMER_SUPPORT; segments COMMERCIAL/INDUSTRIAL/INSTITUTIONAL; ownership THIRD_PARTY_OWNED/CUSTOMER_OWNED; service O_AND_M/FIELD_SERVICE/WARRANTY; payment CONTRACT/RECURRING.

Representative exception: customer requests maintenance on an asset owned by a third party.

Operational path: Observation -> Situation -> Work -> assignment by responsibility scope -> Action/Attempt -> Evidence -> Verification.

Critical distinction: Asset owner != Service provider != Assigned executor.

Result: **Representable by the common kernel and validates ownership/responsibility separation.**

## 8. Cross-pattern findings

### Finding 1 — Organization profile is multidimensional
No tested pattern requires a single organization type.

### Finding 2 — Capability is not role
The same capability can be performed by different job titles across organizations. Authorization must therefore remain permission-based.

### Finding 3 — Responsibility is not ownership
An organization may service an asset it does not own. This must remain explicit.

### Finding 4 — Customer, site, and asset relationships are not universal
Some operations are customer-centric; others are site- or asset-centric. The kernel must not force every workflow through one hierarchy.

### Finding 5 — Payment context does not justify a universal financial domain
Payment exceptions are operational events. Financial accounting should be introduced only where the product requires authoritative financial state.

### Finding 6 — Operational scope is the main unresolved structural dimension
The tested patterns repeatedly need a concept of who is responsible for what within which scope. Potential scopes: organization, branch, territory, customer portfolio, site portfolio, asset portfolio, work type.

### Finding 7 — Workflow differences do not require separate products
Differences can be expressed through capabilities, responsibility, scope, policies, and bounded workflow configuration. No tested pattern requires a separate EPC/PAYGo schema.

## 9. What the current V2 schema can already support

Already present: organization tenancy; actor identity; memberships; roles/permissions; customers; sites; assets; observations; events; situations; work items; actions; execution attempts; verification boundary; communication/audit foundations.

The major configuration layer still requiring implementation design is: operating profile, multi-valued organization activities/segments/models, operational capabilities, and responsibility scope.

## 10. What we should NOT build from this validation

Do not introduce EPC tables, PAYGo tables, mini-grid tables, distributor tables, a generic workflow engine, universal payment ledger, telemetry platform, energy marketplace, blockchain, PCU, job-title authorization enums, or speculative ERP modules.

## 11. Architecture decision

Organization -> Operating Profile -> Activities / Customer segments / Ownership models / Service responsibilities / Payment models / Capabilities; plus Operational Structure/Scope; plus People/Memberships; plus Customers/Sites/Assets; all feeding the common Operational Kernel.

The kernel remains common. Configuration determines how it applies to each organization.

## 12. Next design gate

Before Migration 019 or any role replacement:
1. Define persisted representation of the Operating Profile.
2. Define bounded capability vocabulary and activation model.
3. Define responsibility scopes and minimum required persistence.
4. Define how roles reference permissions without becoming job titles.
5. Test the resulting model against at least one real Lusaka organization's actual workflow.
6. Create only the minimum schema migration required by that evidence.

No frozen Work Item or Action migrations should be reopened merely to accommodate this model.