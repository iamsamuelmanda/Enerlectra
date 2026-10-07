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
});
