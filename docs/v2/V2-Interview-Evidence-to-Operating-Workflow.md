# Enerlectra V2 — Interview Evidence to Operating Workflow

Status: Discovery-derived architecture validation
Source: IGNITE Design Lab 2026 interview workbook
Purpose: Use actual operator evidence to determine the first workflow and the minimum architecture required before Migration 019.

## 1. Evidence reviewed

The workbook contains B2B discovery evidence from Goodlife Group Zambia, DS Solar Zambia, Renwasol, Solar Move Africa, MK Energy Solutions, Switch ACDC, and two boarding-house discovery conversations.

The strongest directly relevant operational evidence comes from DS Solar, Renwasol, Solar Move Africa, MK Energy Solutions, and Switch ACDC.

## 2. Repeated operational pattern

Across the operator interviews, the recurring problem is not simply lack of monitoring.

The repeated pattern is:

Operational signal/problem
→ information arrives through WhatsApp, phone, email, monitoring software, spreadsheets or payment systems
→ staff identify the customer/site/asset/transaction
→ staff investigate across disconnected systems
→ staff communicate with the customer or vendor
→ work may require a field visit or external escalation
→ evidence is collected manually
→ someone confirms whether the issue was actually resolved.

DS Solar: customers report battery failures, overloads and system faults after installation. Diagnosis uses WhatsApp, video calls and physical site visits. The company provides one-year warranty support and manual fault resolution. The interviewee specifically identified automated fault finding as a desired improvement.

Renwasol: the observed chain is Customer payment → Primenet → PayGo token generation → token delivery → customer access to electricity. Failures occur between systems. Staff investigate payment verification, token generation and invalid-token problems, communicate manually with customers, and escalate to vendors.

Solar Move Africa: the company already has technical monitoring, but operational administration remains in Excel and manual follow-up. Inventory, payment tracking, reminders and collections are separate processes. This separates technical monitoring from operational visibility.

MK Energy Solutions: customer communication, payments, inventory, monitoring, maintenance history, support and product exchanges are spread across WhatsApp, email, phone calls, bank/cash payments, Excel and a monitoring system.

Switch ACDC: customer enquiries, installations and after-sales support are handled through phone calls, WhatsApp and manual records. Information about customers, jobs, payments and system status is fragmented.

## 3. First workflow candidate

The evidence supports a common operational workflow:

CUSTOMER / SYSTEM SIGNAL
→ INTAKE
→ IDENTIFY
→ INVESTIGATE
→ DETERMINE RESPONSE
→ ASSIGN WORK
→ ACT
→ CAPTURE EVIDENCE
→ VERIFY
→ CLOSE / ESCALATE

This is more defensible than selecting a product-specific workflow such as PAYGo or EPC.

## 4. Concrete workflow example

A customer reports that a solar system is not providing expected service.

Step 1 — Intake: a support actor receives a WhatsApp, phone or other report.

Step 2 — Identify: the operator identifies the relevant customer, site and asset.

Step 3 — Investigate: the operator reviews available observations and events such as battery faults, overloads, abnormal performance, prior support history, or payment/token status where relevant.

Step 4 — Situation: the system creates or updates a Situation representing the operational interpretation. Example: SERVICE_INTERRUPTION.

Step 5 — Work: a Work Item is created for the required response, such as INVESTIGATE or VISIT_SITE.

Step 6 — Assignment: a responsible actor is assigned to the Work Item. This gives us WHO is responsible for THIS WORK without requiring a generic responsibility-scope engine.

Step 7 — Action: if the work requires a consequential operation, an Action is created. The existing Action model handles proposal, authorization, execution and attempts.

Step 8 — Evidence: the actor records what actually happened, such as a fault code, technician observation, vendor response, or customer confirmation.

Step 9 — Verification: a separate verification determines whether the situation was actually resolved.

## 5. What the interviews imply about responsibility scope

The interviews do not yet provide sufficient evidence for a generic service-territory/customer-portfolio scope engine.

What they clearly demonstrate is:
1. Organizations have operational responsibilities.
2. Actors perform different operational functions.
3. Work needs an accountable actor.
4. Work may concern a customer, site or asset.
5. Responsibility can be bounded by the work assigned to the actor.
6. Geographic territories and customer portfolios are plausible future scopes, but they have not been demonstrated sufficiently to justify persistence as generic infrastructure.

Therefore the first workflow should use the existing work_items.assigned_actor_id as the concrete responsibility boundary.

This does not invalidate the responsibility-scope concept. It means the first implementation should avoid inventing a separate scope abstraction where the operational kernel already expresses the required accountability.

## 6. Implication for Migration 019

Do not create Migration 019 simply to add a generic responsibility-scope system.

The interviews suggest a more conservative sequence:

Gate A — already satisfied: common operational kernel validated across materially different organizations.

Gate B — now satisfied conceptually: a real operator workflow can be represented by Observation → Event → Situation → Work → Action → Attempt → Evidence → Verification.

Gate C — still required: validate the workflow with an actual Lusaka operator in sufficient operational detail.

The workbook contains Lusaka evidence from MK Energy Solutions and Switch ACDC, but the recorded workflows are less detailed than the DS Solar/Renwasol cases.

Therefore a follow-up operational interview should reconstruct one complete real incident from start to finish.

## 7. Exact Lusaka interview needed

Ask the operator to walk through the last real customer/asset problem, not a hypothetical.

Capture:
1. What happened?
2. How did you first hear about it?
3. Who received the report?
4. What information did they need to identify the customer/site/asset?
5. Which systems did they check?
6. Who decided what should happen next?
7. Who was assigned?
8. Was a field visit required?
9. What action was taken?
10. What evidence was collected?
11. Who confirmed the issue was resolved?
12. What did the operator record afterward?
13. What information was still missing?
14. How long did the complete resolution take?
15. How many people touched the case?
16. What external system/vendor was involved?
17. What would have prevented the manual work?

## 8. Responsibility questions

For the same incident, ask:
- Who was accountable for the case?
- Who could assign the work?
- Who could execute the work?
- Who could authorize a consequential action?
- Who verified the outcome?
- Was accountability based on territory, customer portfolio, site, asset, job type, or simply assignment?
- Did the same person perform multiple functions?
- Did responsibility change during the incident?
- What happens when the responsible person is unavailable?

These answers determine whether a persisted responsibility scope is actually required.

## 9. Operating profile evidence

The interviews already demonstrate that organizations can combine multiple dimensions, including installation, maintenance, customer support, monitoring, payments, collections, warranty/after-sales, inventory, exchanges, recurring/PAYGo service, and customer-owned or provider-managed assets.

Therefore the multidimensional operating-profile model remains appropriate.

However, the first profile implementation should only persist dimensions that the pilot actually uses.

## 10. Capability evidence

The evidence supports candidate capabilities including CUSTOMER_MANAGEMENT, SITE_MANAGEMENT, ASSET_MANAGEMENT, INSTALLATION, MAINTENANCE, FIELD_SERVICE, CUSTOMER_SUPPORT, MONITORING, PAYMENT_RECONCILIATION, COLLECTIONS, WARRANTY, INVENTORY / EQUIPMENT_MANAGEMENT, and CONTRACT / SERVICE MANAGEMENT.

These should remain organization configuration, not actor authorization.

## 11. Important product insight

The interviews materially strengthen the distinction between MONITORING and OPERATIONS.

Solar Move Africa already has monitoring but still uses Excel/manual processes for inventory, payment tracking, reminders and collections.

Therefore Enerlectra should not define itself merely as another monitoring dashboard.

The operational value is in connecting:

signal → context → decision → work → action → evidence → verification.

Monitoring can be one source of evidence.

## 12. Current architecture decision

The evidence does not justify creating a PAYGo kernel, EPC kernel, monitoring kernel, generic territory engine, generic portfolio engine, or generic responsibility authorization engine.

The evidence does justify continuing with organization operating profile, organization capabilities, customer/site/asset context, observation/event evidence, situation, work, action/attempt, verification, communication, and audit.

## 13. Next implementation gate

Before Migration 019:

Run one detailed Lusaka operational interview and reconstruct one real incident end-to-end.

If the incident can be represented using the current kernel, do not add responsibility-scope infrastructure merely because the concept exists.

If the incident exposes a real recurring organizational boundary that cannot be represented cleanly by existing assignment, then design the smallest concrete scope model required by that evidence.

Principle:

Persist the boundary that the business actually operates, not the abstraction we imagine it might need at scale.