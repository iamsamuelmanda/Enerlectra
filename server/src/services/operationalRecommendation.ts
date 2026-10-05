import type { TenantContext } from '../platform/tenant/context.js';

export type OperationalRecommendation = {
  recommendationType: string;
  summary: string;
  rationale: string;
  confidence: number;
  contextSnapshot: Record<string, unknown>;
};

type Input = {
  workType?: string;
  customerId?: string;
  siteId?: string;
  assetId?: string;
  title: string;
  summary?: string;
  observationValue: Record<string, unknown>;
};

function hasCapability(tenant: TenantContext, key: string): boolean {
  return tenant.operatingContext.capabilities.includes(key);
}

export function deriveOperationalRecommendation(
  tenant: TenantContext,
  input: Input,
): OperationalRecommendation {
  const workType = input.workType ?? 'INVESTIGATE';
  const hasFieldExecution =
    hasCapability(tenant, 'FIELD_SERVICE') ||
    hasCapability(tenant, 'MAINTENANCE') ||
    hasCapability(tenant, 'INSTALLATION');
  const hasCustomerSupport = hasCapability(tenant, 'CUSTOMER_SUPPORT');
  const hasPaymentReconciliation = hasCapability(tenant, 'PAYMENT_RECONCILIATION');

  let recommendationType = 'OPERATIONAL_INVESTIGATION';
  let summary = 'Review the available evidence and determine the next operational step before taking consequential action.';
  let rationale = 'The situation has been normalized from operational evidence; a human should evaluate context and select the appropriate resolution path.';
  let confidence = 0.65;

  switch (workType) {
    case 'VISIT_SITE':
      recommendationType = 'FIELD_INVESTIGATION';
      summary = hasFieldExecution
        ? 'Assign the appropriate field responsibility to inspect the site or asset and capture outcome evidence.'
        : 'Arrange an appropriate site visit through the organization’s responsible operational function and capture outcome evidence.';
      rationale = 'A site-level condition is best resolved by obtaining direct operational evidence before closure.';
      confidence = hasFieldExecution ? 0.82 : 0.72;
      break;
    case 'CONTACT_CUSTOMER':
      recommendationType = 'STAKEHOLDER_CONTACT';
      summary = hasCustomerSupport
        ? 'Use the organization’s customer-support process to contact the customer, clarify the condition, and record the outcome.'
        : 'Contact the relevant customer or stakeholder, clarify the condition, and record the outcome as operational evidence.';
      rationale = 'Direct stakeholder context can disambiguate the reported condition and prevent unnecessary work.';
      confidence = hasCustomerSupport ? 0.84 : 0.74;
      break;
    case 'RECONCILE_PAYMENT':
      recommendationType = 'RECORD_RECONCILIATION';
      summary = hasPaymentReconciliation
        ? 'Reconcile the available payment evidence against the organization’s service or account record, then verify the resulting state.'
        : 'Review the available financial/service evidence with the responsible function and verify the resulting operational state.';
      rationale = 'The issue references reconciliation; the exact financial system remains outside the operational kernel.';
      confidence = hasPaymentReconciliation ? 0.86 : 0.7;
      break;
    case 'ESCALATE_EXTERNAL':
      recommendationType = 'EXTERNAL_ESCALATION';
      summary = 'Compile the available evidence, identify the responsible external party, and escalate with a traceable request for resolution.';
      rationale = 'The current operating context indicates that resolution may depend on an external party or system.';
      confidence = 0.78;
      break;
    default:
      break;
  }

  return {
    recommendationType,
    summary,
    rationale,
    confidence,
    contextSnapshot: {
      operatingProfileId: tenant.operatingContext.profileId,
      businessModels: tenant.operatingContext.businessModels,
      capabilities: tenant.operatingContext.capabilities,
      policyKeys: Object.keys(tenant.operatingContext.policies),
      workType,
      hasCustomer: Boolean(input.customerId),
      hasSite: Boolean(input.siteId),
      hasAsset: Boolean(input.assetId),
      title: input.title,
      summary: input.summary ?? null,
      observationKeys: Object.keys(input.observationValue),
    },
  };
}
