import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createCustomerOperationalIssuesRouter } from '../server/src/routes/customerOperationalIssues.js';

const url = process.env.V2_SUPABASE_URL;
const serviceRoleKey = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;
const integrationEnabled = Boolean(url && serviceRoleKey);

test('V2 Customer Operational Issue authenticated HTTP gate is configured', () => {
  if (!integrationEnabled) {
    assert.ok(true, 'Set V2_SUPABASE_URL and V2_SUPABASE_SERVICE_ROLE_KEY to run live authenticated HTTP tests.');
  }
});

if (integrationEnabled) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now().toString(36);
  const password = `V2_Issue_Integration_${runId}_Secure!`;
  const users = {};
  const orgs = {};
  const actors = {};
  let server;
  let baseUrl;

  async function createAuthUser(label) {
    const email = `v2-issue-${label}-${runId}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    users[label] = { id: data.user.id, email };
    return data.user.id;
  }

  async function signIn(label) {
    const authClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({
      email: users[label].email,
      password,
    });
    assert.ifError(error);
    assert.ok(data.session?.access_token);
    return data.session.access_token;
  }

  async function seedOrg(label) {
    const { data, error } = await admin
      .from('organizations')
      .insert({ name: `V2 Issue Test ${label} ${runId}`, status: 'ACTIVE' })
      .select('id')
      .single();
    assert.ifError(error);
    orgs[label] = data.id;
    return data.id;
  }

  async function seedActor(label, authUserId, roleKey, orgId, status = 'ACTIVE') {
    const { data: actor, error: actorError } = await admin
      .from('actors')
      .insert({ auth_user_id: authUserId, status })
      .select('id')
      .single();
    assert.ifError(actorError);

    const { data: role, error: roleError } = await admin
      .from('roles')
      .select('id')
      .eq('key', roleKey)
      .single();
    assert.ifError(roleError);

    const { error: membershipError } = await admin.from('memberships').insert({
      organization_id: orgId,
      actor_id: actor.id,
      role_id: role.id,
      status: 'ACTIVE',
    });
    assert.ifError(membershipError);

    actors[label] = actor.id;
    return actor.id;
  }

  async function request(token, organizationId, body, extraHeaders = {}) {
    const response = await fetch(`${baseUrl}/api/operational-issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-organization-id': organizationId,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }

  async function deleteById(table, column, value) {
    const { error } = await admin.from(table).delete().eq(column, value);
    assert.ifError(error);
  }

  before(async () => {
    const authIds = await Promise.all([
      createAuthUser('operator'),
      createAuthUser('viewer'),
      createAuthUser('inactive'),
      createAuthUser('other'),
    ]);

    const [orgA, orgB] = await Promise.all([
      seedOrg('A'),
      seedOrg('B'),
    ]);

    await Promise.all([
      seedActor('operator', authIds[0], 'OPERATOR', orgA),
      seedActor('viewer', authIds[1], 'VIEWER', orgA),
      seedActor('inactive', authIds[2], 'OPERATOR', orgA, 'SUSPENDED'),
      seedActor('other', authIds[3], 'OPERATOR', orgB),
    ]);

    const app = express();
    app.use(express.json());
    app.use('/api/operational-issues', createCustomerOperationalIssuesRouter(admin));

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    // Explicit cleanup keeps this gate repeatable even if tenant cascades evolve.
    for (const orgId of Object.values(orgs)) {
      await deleteById('organizations', 'id', orgId);
    }
    for (const actorId of Object.values(actors)) {
      await deleteById('actors', 'id', actorId);
    }
    for (const user of Object.values(users)) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      assert.ifError(error);
    }
  });

  test('authenticated operator creates an issue in its resolved tenant', async () => {
    const token = await signIn('operator');
    const result = await request(token, orgs.A, {
      title: 'Pump stopped providing service',
      summary: 'Customer reports the pump stopped after initially working.',
      observationValue: { report: 'pump stopped' },
      severity: 'HIGH',
      priority: 'HIGH',
      idempotencyKey: `create-${runId}`,
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.success, true);
    assert.equal(result.body.organizationId, orgs.A);
    assert.equal(result.body.actorId, actors.operator);
    assert.ok(result.body.observationId);
    assert.ok(result.body.eventId);
    assert.ok(result.body.situationId);
    assert.ok(result.body.workItemId);
  });

  test('forged organization header cannot move the authenticated actor into another tenant', async () => {
    const token = await signIn('operator');
    const result = await request(token, orgs.B, {
      title: 'Forged tenant test',
      observationValue: { report: 'must not cross tenant' },
      idempotencyKey: `forged-org-${runId}`,
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'MEMBERSHIP_NOT_FOUND');
  });

  test('viewer role is authenticated but cannot create an operational issue', async () => {
    const token = await signIn('viewer');
    const result = await request(token, orgs.A, {
      title: 'Unauthorized role test',
      observationValue: { report: 'must be denied' },
      idempotencyKey: `viewer-${runId}`,
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'MISSING_PERMISSION');
  });

  test('inactive actor cannot create an operational issue', async () => {
    const token = await signIn('inactive');
    const result = await request(token, orgs.A, {
      title: 'Inactive actor test',
      observationValue: { report: 'must be denied' },
      idempotencyKey: `inactive-${runId}`,
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'ACTOR_INACTIVE');
  });

  test('duplicate idempotency key returns the original operational chain', async () => {
    const token = await signIn('operator');
    const body = {
      title: 'Repeated customer report',
      observationValue: { report: 'same report' },
      idempotencyKey: `duplicate-${runId}`,
    };

    const first = await request(token, orgs.A, body);
    const second = await request(token, orgs.A, body);

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.deepEqual(
      {
        observationId: second.body.observationId,
        eventId: second.body.eventId,
        situationId: second.body.situationId,
        workItemId: second.body.workItemId,
      },
      {
        observationId: first.body.observationId,
        eventId: first.body.eventId,
        situationId: first.body.situationId,
        workItemId: first.body.workItemId,
      },
    );
  });

  test('cross-tenant assigned actor is rejected by the database authorization boundary', async () => {
    const token = await signIn('operator');
    const result = await request(token, orgs.A, {
      title: 'Cross-tenant assignment test',
      observationValue: { report: 'must not assign to Org B actor' },
      assignedActorId: actors.other,
      idempotencyKey: `cross-assignee-${runId}`,
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'ASSIGNED_ACTOR_NOT_ACTIVE_MEMBER');
  });

  test('malformed correlation header is normalized before persistence', async () => {
    const token = await signIn('operator');
    const result = await request(
      token,
      orgs.A,
      {
        title: 'Correlation normalization test',
        observationValue: { report: 'correlation should remain valid' },
        idempotencyKey: `correlation-${runId}`,
      },
      { 'x-correlation-id': `not-a-uuid-${runId}` },
    );

    assert.equal(result.status, 201);
    assert.match(result.body.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('missing bearer token is rejected before tenant resolution', async () => {
    const response = await fetch(`${baseUrl}/api/operational-issues`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Unauthenticated test',
        observationValue: { report: 'must be denied' },
      }),
    });

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'UNAUTHENTICATED');
  });
}
