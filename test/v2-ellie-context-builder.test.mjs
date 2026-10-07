import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalEllieContext } from '../server/src/platform/intelligence/ellie-context-builder.ts';

test('canonical Ellie context derives authority from TenantContext', () => {
  const tenant = {
    actorId: 'actor-a',
    organizationId: 'org-a',
    membershipId: 'membership-a',
    roles: ['OWNER'],
    permissions: ['situation.read', 'work.read', 'action.create'],
    operatingContext: {
      profileId: 'profile-a',
      profileName: 'C&I',
      profileConfiguration: {},
      businessModels: ['C&I'],
      capabilities: ['FIELD_OPERATIONS'],
      capabilityConfiguration: { FIELD_OPERATIONS: { enabled: true } },
      policies: { maxOperationalConsequence: 'OPERATIONAL' },
    },
    correlationId: 'corr-a',
    requestId: 'req-a',
    source: 'api',
  };

  const context = buildCanonicalEllieContext(tenant, {
    situations: [{
      id: 'situation-a',
      status: 'OPEN',
      title: 'Meter anomaly',
      severity: 'HIGH',
      customer_id: 'customer-a',
      site_id: 'site-a',
      asset_id: 'asset-a',
      workItems: [{
        id: 'work-a',
        situation_id: 'situation-a',
        status: 'READY',
        work_type: 'FIELD_CHECK',
        actions: [{
          id: 'action-a',
          action_type: 'PERFORM_FIELD_CHECK',
          consequence_class: 'OPERATIONAL',
          status: 'SUCCEEDED',
          attempts: [{
            id: 'attempt-a',
            action_id: 'action-a',
            attempt_number: 1,
            status: 'SUCCEEDED',
            result_code: 'OK',
            result_summary: 'Field check completed',
          }],
        }],
      }],
      recommendations: [{
        id: 'recommendation-a',
        situation_id: 'situation-a',
        status: 'ACTIVE',
        recommendation_type: 'INVESTIGATE',
        summary: 'Inspect the meter',
        confidence: 0.91,
      }],
    }],
  });

  assert.equal(context.source, 'canonical');
  assert.equal(context.actorId, 'actor-a');
  assert.equal(context.organizationId, 'org-a');
  assert.deepEqual(context.permissions, tenant.permissions);
  assert.deepEqual(context.policies, tenant.operatingContext.policies);
  assert.equal(context.situations[0].id, 'situation-a');
  assert.equal(context.work[0].id, 'work-a');
  assert.equal(context.recommendations[0].id, 'recommendation-a');
  assert.equal(context.evidence[0].id, 'attempt-a');
  assert.equal(context.evidence[0].type, 'ACTION_ATTEMPT_RESULT');

  const snapshotContext = buildCanonicalEllieContext(tenant, { situations: [] }, [], {
    customerCount: 12,
    siteCount: 8,
    assetCount: 21,
    openSituationCount: 3,
    openWorkItemCount: 5,
    activeActionCount: 2,
  });
  assert.equal(snapshotContext.organizationSnapshot.customerCount, 12);
  assert.equal(snapshotContext.organizationSnapshot.assetCount, 21);
  assert.equal(snapshotContext.organizationSnapshot.openSituationCount, 3);

  const memoryContext = buildCanonicalEllieContext(tenant, { situations: [] }, [{
    id: 'memory-a',
    memoryType: 'OUTCOME_PATTERN',
    scopeKey: 'meter-anomaly',
    statement: 'Verified field checks resolve this anomaly class.',
    evidenceRefs: ['attempt-a'],
    confidence: 0.92,
    occurrenceCount: 4,
  }]);
  assert.equal(memoryContext.memories[0].id, 'memory-a');
  assert.equal(memoryContext.memories[0].confidence, 0.92);
});


import { validateInferenceAgainstContext } from '../server/src/routes/ellie.ts';

test('Ellie inference boundary rejects fabricated evidence and targets only supplied resources', () => {
  const context = buildCanonicalEllieContext({
    actorId: 'actor-a',
    organizationId: 'org-a',
    membershipId: 'membership-a',
    roles: ['OWNER'],
    permissions: ['recommendation.read'],
    operatingContext: { capabilities: [], policies: {} },
    correlationId: 'corr-a',
    requestId: 'req-a',
    source: 'api',
  }, {
    situations: [{
      id: 'situation-a',
      status: 'OPEN',
      title: 'Inverter fault',
      customer_id: 'customer-a',
      site_id: 'site-a',
      asset_id: 'asset-a',
      workItems: [],
      recommendations: [],
    }],
  }, {
    customers: [{ id: 'customer-b' }],
    sites: [],
    assets: [],
    activeExceptions: [],
    recentEvidence: [],
    operationalHistory: [],
    availableResourceTypes: ['CUSTOMER'],
  }, [{
    id: 'memory-a',
    memoryType: 'OUTCOME_PATTERN',
    knowledgeType: 'OUTCOME',
    scopeKey: 'situation-a',
    statement: 'Verified field inspection resolved the case.',
    evidenceRefs: ['evidence-a'],
    resourceRefs: ['asset-a'],
    confidence: 0.9,
    evidenceStrength: 0.9,
    occurrenceCount: 1,
    contradictionCount: 0,
    lastConfirmedAt: new Date().toISOString(),
  }]);

  const validInference = {
    summary: 'Inspect the inverter.',
    rationale: 'The open situation concerns the supplied asset.',
    recommendationType: 'FIELD_CHECK',
    confidence: 0.8,
    evidenceUsed: ['situation-a', 'memory-a'],
    targetSituationId: 'situation-a',
    targetResourceIds: ['asset-a'],
  };
  assert.doesNotThrow(() => validateInferenceAgainstContext(validInference, context));

  assert.throws(
    () => validateInferenceAgainstContext({ ...validInference, evidenceUsed: ['forged-evidence'] }, context),
    /ELLIE_EVIDENCE_REFERENCE_INVALID/,
  );
  assert.throws(
    () => validateInferenceAgainstContext({ ...validInference, targetResourceIds: ['asset-not-supplied'] }, context),
    /ELLIE_TARGET_RESOURCE_INVALID/,
  );
  assert.throws(
    () => validateInferenceAgainstContext({ ...validInference, targetResourceIds: ['customer-b'] }, context),
    /ELLIE_TARGET_RESOURCE_SITUATION_MISMATCH/,
  );
  assert.throws(
    () => validateInferenceAgainstContext({ ...validInference, learningSignal: 'Case outcome without a target.' , targetSituationId: undefined }, context),
    /ELLIE_LEARNING_TARGET_REQUIRED/,
  );
});
