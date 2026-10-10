# Enerlectra V2 — Market Operating Model & Responsibility Specification

**Status:** Review gate before further authorization/schema changes  
**Date:** 2026-09-21  
**Scope:** Lusaka-first distributed-energy market; scalable operating-model foundation

## 1. Purpose

Enerlectra is not an EPC application, PAYGo application, CRM, field-service clone, or generic enterprise workflow platform.

The target is:

> A multi-tenant operational-intelligence platform for distributed-energy businesses.

The initial commercial laboratory is distributed-energy businesses operating in Lusaka. The platform must represent materially different operating realities without creating separate products or schemas for each business model.

The previously interviewed companies are evidence for discovery, not the definition of the market.

## 2. Design principle

The platform models how an organization operates, not merely what industry label it has.

One organization may combine installation, distribution, maintenance, financing, energy service, customer support, and other activities introduced later.

Therefore:

- business model is context;
- activities describe what the organization does;
- capabilities describe what Enerlectra supports for that organization;
- responsibilities describe what the organization or actors are accountable for;
- permissions determine what an actor may perform;
- authorization governs consequential actions.

## 3. Operating profile

Each organization may have a bounded operating profile containing:

### Business activities
- INSTALLATION
- DISTRIBUTION
- MAINTENANCE
- FINANCING
- ENERGY_GENERATION
- ENERGY_SERVICE
- CUSTOMER_SUPPORT

### Customer segments
- RESIDENTIAL
- SME
- COMMERCIAL
- INDUSTRIAL
- INSTITUTIONAL
- PUBLIC_SECTOR
- OTHER

### Asset/ownership models
- CUSTOMER_OWNED
- ORGANIZATION_OWNED
- FINANCED
- THIRD_PARTY_OWNED

Ownership and operational responsibility are separate.

### Service responsibilities
- INSTALLATION
- WARRANTY
- O_AND_M
- CUSTOMER_SUPPORT
- REMOTE_MONITORING
- FIELD_SERVICE

### Payment models
- CASH
- RECURRING
- PAYGO
- CONTRACT
- MIXED

### Operational capabilities
- CUSTOMER_MANAGEMENT
- SITE_MANAGEMENT
- ASSET_MANAGEMENT
- PROJECT_DELIVERY
- INSTALLATION
- COMMISSIONING
- WARRANTY
- MAINTENANCE
- FIELD_SERVICE
- PAYMENT_RECONCILIATION
- COLLECTIONS
- CUSTOMER_SUPPORT
- REMOTE_SERVICE
- MONITORING
- CONTRACT_MANAGEMENT
- PORTFOLIO_REPORTING

These are controlled reference values, not a commitment to build every capability immediately.

## 4. Responsibility model

Do not make job titles the authorization model.

A person may be called technician, field officer, support agent, operations manager, finance officer, or owner while performing overlapping operational functions.

Enerlectra therefore separates:

- Role — reusable permission bundle.
- Capability — an operation supported by the organization/platform.
- Responsibility — accountability for a bounded operational scope.
- Permission — machine-enforceable authorization to perform an operation.
- Authorization — a specific decision permitting a consequential Action.

Conceptually:

    Actor
      |
    Membership
      |
    Role/profile
      |
    Permissions
      +
    Responsibility scope
      +
    Organization capability/policy
      |
    Operation

A job title may become organizational metadata later, but it must not determine security.

## 5. Responsibility scope

Potential scopes include organization-wide, branch/office, service territory, customer portfolio, site portfolio, asset portfolio, work type, and financial operation.

Only scopes required by real pilot workflows should become first-class persisted concepts.

## 6. Operating patterns to validate

These are reference operating patterns, not separate products.

### Installation/service operator
May combine installation, commissioning, warranty, maintenance, and customer support.

### PAYGo/recurring-service operator
May combine customer finance, collections, payment reconciliation, customer support, maintenance, and remote service.

### C&I / portfolio operator
May combine generation, asset management, monitoring, O&M, and contract/service management.

### Distributor/equipment service organization
May combine distribution, customer support, warranty, equipment inspection, and returns/service.

### Maintenance/field-service organization
May primarily provide field service, maintenance, inspection, and warranty support for third parties.

Each pattern can use the same operational kernel.

## 7. What is genuinely common

The durable operational primitives are:

- organization;
- actor;
- membership;
- customer;
- site;
- asset;
- observation/evidence;
- event;
- situation;
- responsibility;
- work;
- action;
- attempt/execution;
- verification;
- communication;
- audit.

The common loop is:

    OBSERVE -> UNDERSTAND -> DETECT -> PRIORITIZE -> ASSIGN -> ACT -> VERIFY -> LEARN

## 8. What is not common enough to become core

Do not make these universal primitives merely because some businesses use them:

- PAYGo token;
- energy wallet;
- project milestone;
- tariff;
- generator dispatch;
- customer financing account;
- inventory;
- procurement;
- meter;
- telemetry stream;
- energy trade;
- settlement;
- blockchain;
- cluster;
- PCU.

These can become bounded capabilities if real customer demand proves the need.

## 9. Product implication

The operating profile is not itself the moat. It gives the operational intelligence layer enough context to interpret events correctly.

Example:

    Observation: Inverter is not working.

Without context: generic support ticket.

With context: organization provides O&M; asset is under warranty; site belongs to a commercial customer; responsible field team is Lusaka; previous related incident exists.

The same observation can therefore produce better operational understanding without requiring an EPC-specific product.

## 10. Commercial validation

For each pilot organization, capture where possible:

- customers;
- sites;
- operational assets;
- recurring exceptions;
- detection time;
- assignment time;
- resolution time;
- repeat incidents;
- field visits;
- cost per visit;
- staff time;
- revenue/payment affected;
- customer downtime;
- unresolved cases;
- avoidable rework.

Enerlectra should ultimately be paid for reducing or controlling operational cost/risk, not merely for storing records.

## 11. Schema consequences

1. Keep organizations as the sole tenant.
2. Keep Actor separate from Customer.
3. Keep permissions as the authorization primitive.
4. Do not replace current role names with job-title roles yet.
5. Introduce operating-profile configuration as a bounded domain.
6. Allow multiple activities/models/capabilities per organization.
7. Keep ownership separate from operational responsibility.
8. Make responsibility scope explicit where pilot workflows require it.
9. Keep workflow configuration bounded to platform-defined primitives.
10. Do not introduce EPC/PAYGo-specific tables.
11. Do not reopen frozen Work Item migrations 009–014.
12. Do not modify Action migrations 015–018 unless a concrete defect is found.
13. Do not build financial/telemetry/marketplace primitives speculatively.

## 12. Gate for the next schema revision

The role/capability/operating-profile design should be validated by testing whether it can represent, without special-case domain tables:

- an installation/service operator;
- a PAYGo/recurring-service operator;
- a C&I/portfolio operator;
- a distributor/equipment-service organization;
- a maintenance/field-service organization.

The next schema work should implement only the dimensions demonstrably needed by the first Lusaka pilot.

## 13. Decision

**Decision:** Do not create Migration 019 to rename the current roles yet.

The current role/permission foundation remains temporarily valid. Role vocabulary is now an explicit review item rather than a frozen product assumption.

**Decision:** Organization operating profile becomes a first-class V2 design concern.

**Decision:** Business-model archetypes remain reference classifications, not product boundaries.

**Decision:** Capability and responsibility are distinct from role/job title.

**Decision:** The platform remains one operational kernel with organization-specific configuration.
