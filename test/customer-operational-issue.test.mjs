import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerOperationalIssue } from '../server/src/services/customerOperationalIssues.js';

function mockDb() {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: [{
          observation_id: 'observation-1',
          event_id: 'event-1',
          situation_id: 'situation-1',
          work_item_id: 'work-item-1',
        }],
        error: null,
      };
    },
  };
}

test('customer operational issue service delegates atomically to the tenant-scoped DB transaction', async () => {
  const db = mockDb();
  const tenant = {
    actorId: 'actor-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roles: ['OPERATOR'],
    permissions: ['situation.manage', 'work.execute', 'work.assign'],
    correlationId: 'corr-1',
    requestId: 'req-1',
    source: 'web',
  };

  const result = await createCustomerOperationalIssue(db, tenant, {
    title: 'Pump stopped providing service',
    summary: 'Customer reports pump stopped after initially working.',
    customerId: 'customer-1',
    siteId: 'site-1',
    assetId: 'asset-1',
    observationValue: { report: 'pump stopped' },
    assignedActorId: 'actor-2',
    idempotencyKey: 'issue-1',
  });

  assert.deepEqual(result, {
    observationId: 'observation-1',
    eventId: 'event-1',
    situationId: 'situation-1',
    workItemId: 'work-item-1',
  });

  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].name, 'create_customer_operational_issue');
  assert.equal(db.calls[0].args.p_organization_id, 'org-1');
  assert.equal(db.calls[0].args.p_actor_id, 'actor-1');
  assert.equal(db.calls[0].args.p_assigned_actor_id, 'actor-2');
  assert.equal(db.calls[0].args.p_idempotency_key, 'issue-1');
});

test('customer operational issue service rejects an invalid database transaction result', async () => {
  const db = {
    rpc: async () => ({
      data: [{ observation_id: 'only-one-id' }],
      error: null,
    }),
  };

  await assert.rejects(
    createCustomerOperationalIssue(db, {
      actorId: 'actor-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roles: ['OPERATOR'],
      permissions: ['situation.manage', 'work.execute'],
      correlationId: 'corr-1',
      requestId: 'req-1',
      source: 'web',
    }, {
      title: 'Invalid result test',
      observationValue: { report: 'test' },
    }),
    /invalid result/,
  );
});
