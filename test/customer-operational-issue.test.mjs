import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerOperationalIssue } from '../server/src/services/customerOperationalIssues.js';

function mockDb() {
  const inserts = [];
  const db = {
    inserts,
    from(table) {
      const state = { table, payload: null };
      const builder = {
        insert(payload) { state.payload = payload; inserts.push(state); return builder; },
        select() { return builder; },
        single: async () => ({ data: { id: state.table + '-id' }, error: null }),
      };
      return builder;
    },
  };
  return db;
}

test('customer operational issue orchestration preserves tenant boundary and evidence provenance', async () => {
  const db = mockDb();
  const tenant = {
    actorId: 'actor-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roles: ['OPERATOR'],
    permissions: ['situation.manage', 'work.assign'],
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
    observationId: 'observations-id',
    eventId: 'events-id',
    situationId: 'situations-id',
    workItemId: 'work_items-id',
  });

  assert.equal(db.inserts.length, 4);
  for (const item of db.inserts) {
    assert.equal(item.payload.organization_id, 'org-1');
  }

  assert.equal(db.inserts[0].payload.provenance.verified, false);
  assert.equal(db.inserts[3].payload.assigned_actor_id, 'actor-2');
});
