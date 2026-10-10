import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInferenceAgainstContext } from '../server/src/routes/ellie.ts';

const baseContext = {
  actorId: 'actor-1',
  organizationId: 'org-1',
  permissions: ['recommendation.read'],
  operatingContext: {},
  capabilities: {},
  policies: {},
  evidence: [{ id: 'evidence-1', type: 'CUSTOMER_REPORT', resourceId: 'customer-1' }],
  situations: [{
    id: 'situation-1',
    status: 'OPEN',
    resourceId: 'asset-1',
    metadata: { customerId: 'customer-1', siteId: 'site-1', assetId: 'asset-1' },
  }],
  recommendations: [],
  work: [],
  memories: [{
    id: 'memory-1',
    memoryType: 'OUTCOME_PATTERN',
    knowledgeType: 'OUTCOME',
    scopeKey: 'situation-1',
    statement: 'A field visit resolved this case.',
    evidenceRefs: ['evidence-1'],
    resourceRefs: ['asset-1'],
    confidence: 0.9,
    evidenceStrength: 0.9,
    occurrenceCount: 1,
    contradictionCount: 0,
    lastConfirmedAt: new Date().toISOString(),
  }],
  source: 'canonical',
};

function inference(overrides = {}) {
  return {
    summary: 'Investigate the asset.',
    rationale: 'The supplied evidence indicates an unresolved operational issue.',
    recommendationType: 'INVESTIGATE',
    confidence: 0.8,
    evidenceUsed: ['evidence-1'],
    targetSituationId: 'situation-1',
    targetResourceIds: ['asset-1'],
    ...overrides,
  };
}

test('Ellie accepts an inference whose evidence and targets exist in canonical context', () => {
  assert.doesNotThrow(() => validateInferenceAgainstContext(inference(), baseContext));
});

test('Ellie rejects fabricated evidence references', () => {
  assert.throws(
    () => validateInferenceAgainstContext(inference({ evidenceUsed: ['fabricated-evidence'] }), baseContext),
    /ELLIE_EVIDENCE_REFERENCE_INVALID/,
  );
});

test('Ellie rejects a target situation outside canonical context', () => {
  assert.throws(
    () => validateInferenceAgainstContext(inference({ targetSituationId: 'other-situation' }), baseContext),
    /ELLIE_TARGET_SITUATION_INVALID/,
  );
});

test('Ellie rejects resources unrelated to the selected situation', () => {
  assert.throws(
    () => validateInferenceAgainstContext(inference({ targetResourceIds: ['unrelated-resource'] }), baseContext),
    /ELLIE_TARGET_RESOURCE_INVALID/,
  );
});

test('Ellie allows a recommendation with no specific situation', () => {
  assert.doesNotThrow(() => validateInferenceAgainstContext(
    inference({ targetSituationId: undefined, targetResourceIds: [], learningSignal: undefined }),
    baseContext,
  ));
});

test('Ellie requires a target when emitting a learning signal', () => {
  assert.throws(
    () => validateInferenceAgainstContext(
      inference({ targetSituationId: undefined, targetResourceIds: [], learningSignal: 'This case was resolved by a field visit.' }),
      baseContext,
    ),
    /ELLIE_LEARNING_TARGET_REQUIRED/,
  );
});
