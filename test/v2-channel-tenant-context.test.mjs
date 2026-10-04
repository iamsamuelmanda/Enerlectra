import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChannelTenantContext, ChannelTenantResolutionError } from '../server/src/platform/tenant/channel-resolver.ts';

class Query {
  constructor(table, rows) {
    this.table = table;
    this.rows = rows;
    this.filters = {};
  }
  select() { return this; }
  eq(key, value) { this.filters[key] = value; return this; }
  result() {
    return this.rows.filter((row) => Object.entries(this.filters).every(([key, value]) => row[key] === value));
  }
  async maybeSingle() { return { data: this.result()[0] ?? null, error: null }; }
  then(resolve, reject) { return Promise.resolve({ data: this.result(), error: null }).then(resolve, reject); }
}

function fixture(overrides = {}) {
  const data = {
    channel_identities: [{ id: 'ci-1', actor_id: 'actor-1', channel: 'whatsapp', external_id: '+260-test', status: 'ACTIVE' }],
    actors: [{ id: 'actor-1', status: 'ACTIVE' }],
    memberships: [{
      id: 'membership-1', actor_id: 'actor-1', organization_id: 'org-1', role_id: 'role-1',
      status: 'ACTIVE', organizations: { id: 'org-1', status: 'ACTIVE' }, roles: { key: 'OPERATOR' },
    }],
    role_permissions: [{ role_id: 'role-1', permissions: { key: 'situation.manage' } }],
    ...overrides,
  };
  return {
    from(table) { return new Query(table, data[table] ?? []); },
  };
}

const input = {
  channel: 'whatsapp',
  externalId: '+260-test',
  correlationId: 'correlation-1',
  requestId: 'request-1',
};

test('channel identity resolves to canonical actor, active membership, organization and permissions', async () => {
  const context = await resolveChannelTenantContext(fixture(), input);
  assert.equal(context.actorId, 'actor-1');
  assert.equal(context.organizationId, 'org-1');
  assert.equal(context.membershipId, 'membership-1');
  assert.deepEqual(context.roles, ['OPERATOR']);
  assert.deepEqual(context.permissions, ['situation.manage']);
  assert.equal(context.source, 'whatsapp');
});

test('unlinked channel identity is rejected', async () => {
  await assert.rejects(
    resolveChannelTenantContext(fixture({ channel_identities: [] }), input),
    (error) => error instanceof ChannelTenantResolutionError && error.code === 'CHANNEL_IDENTITY_NOT_FOUND',
  );
});

test('disabled channel identity is rejected', async () => {
  await assert.rejects(
    resolveChannelTenantContext(fixture({
      channel_identities: [{ id: 'ci-1', actor_id: 'actor-1', channel: 'whatsapp', external_id: '+260-test', status: 'DISABLED' }],
    }), input),
    (error) => error instanceof ChannelTenantResolutionError && error.code === 'CHANNEL_IDENTITY_DISABLED',
  );
});

test('inactive actor is rejected', async () => {
  await assert.rejects(
    resolveChannelTenantContext(fixture({ actors: [{ id: 'actor-1', status: 'SUSPENDED' }] }), input),
    (error) => error instanceof ChannelTenantResolutionError && error.code === 'ACTOR_INACTIVE',
  );
});

test('missing active membership is rejected', async () => {
  await assert.rejects(
    resolveChannelTenantContext(fixture({ memberships: [] }), input),
    (error) => error instanceof ChannelTenantResolutionError && error.code === 'MEMBERSHIP_NOT_FOUND',
  );
});

test('ambiguous active memberships are rejected rather than guessing an organization', async () => {
  const rows = [
    { id: 'membership-1', actor_id: 'actor-1', organization_id: 'org-1', role_id: 'role-1', status: 'ACTIVE', organizations: { id: 'org-1', status: 'ACTIVE' }, roles: { key: 'OPERATOR' } },
    { id: 'membership-2', actor_id: 'actor-1', organization_id: 'org-2', role_id: 'role-1', status: 'ACTIVE', organizations: { id: 'org-2', status: 'ACTIVE' }, roles: { key: 'OPERATOR' } },
  ];
  const db = fixture({ memberships: rows });
  await assert.rejects(
    resolveChannelTenantContext(db, input),
    (error) => error instanceof ChannelTenantResolutionError && error.code === 'AMBIGUOUS_ORGANIZATION',
  );
});
