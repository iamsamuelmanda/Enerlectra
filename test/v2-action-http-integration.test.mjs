import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createActionsRouter } from '../server/src/routes/actions.ts';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const enabled = Boolean(url && serviceRoleKey && anonKey);

test('V2 Action HTTP gate is configured', () => {
  if (!enabled) assert.ok(true, 'Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the live gate.');
});

if (enabled) {
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now().toString(36);
  const password = `V2_Action_HTTP_${runId}_Secure!`;
  const users = {};
  let orgId;
  let actorIds = {};
  let workItemId;
  let server;

  async function createUser(label) {
    const email = `v2-action-http-${label}-${runId}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    users[label] = { id: data.user.id, email };
    return data.user.id;
  }

  async function signIn(label) {
    const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email: users[label].email, password });
    assert.ifError(error);
    return data.session.access_token;
  }

  async function actor(label, authId, roleKey) {
    const { data: a, error: ae } = await admin.from('actors').insert({ auth_user_id: authId, status: 'ACTIVE' }).select('id').single();
    assert.ifError(ae);
    const { data: role, error: re } = await admin.from('roles').select('id').eq('key', roleKey).single();
    assert.ifError(re);
    const { error: me } = await admin.from('memberships').insert({
      organization_id: orgId, actor_id: a.id, role_id: role.id, status: 'ACTIVE',
    });
    assert.ifError(me);
    actorIds[label] = a.id;
  }

  async function request(token, method, path, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  before(async () => {
    const [operatorAuth, ownerAuth, technicianAuth] = await Promise.all([
      createUser('operator'), createUser('owner'), createUser('technician'),
    ]);
    const { data: org, error: oe } = await admin.from('organizations')
      .insert({ name: `V2 Action HTTP ${runId}`, status: 'ACTIVE' }).select('id').single();
    assert.ifError(oe);
    orgId = org.id;
    await actor('operator', operatorAuth, 'OPERATOR');
    await actor('owner', ownerAuth, 'OWNER');
    await actor('technician', technicianAuth, 'TECHNICIAN');

    const { data: situation, error: se } = await admin.from('situations').insert({
      organization_id: orgId, situation_type: 'equipment_fault', status: 'OPEN',
      severity: 'HIGH', title: 'HTTP Action gate', summary: 'test',
    }).select('id').single();
    assert.ifError(se);
    const { data: work, error: we } = await admin.from('work_items').insert({
      organization_id: orgId, situation_id: situation.id, work_type: 'INVESTIGATE',
      status: 'OPEN', priority: 'HIGH', title: 'HTTP Action work', created_by_actor_id: actorIds.operator,
    }).select('id').single();
    assert.ifError(we);
    workItemId = work.id;

    const app = express();
    app.use(express.json());
    app.use('/api/v2/actions', createActionsRouter(admin));
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (orgId) await admin.from('organizations').delete().eq('id', orgId);
    for (const user of Object.values(users)) {
      await admin.from('actors').delete().eq('auth_user_id', user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  });

  test('authenticated Operator can propose and tenant is server-derived', async () => {
    const token = await signIn('operator');
    const result = await request(token, 'POST', '/api/v2/actions', {
      workItemId, actionType: 'INSPECT_ASSET', consequenceClass: 'OBSERVATIONAL',
      idempotencyKey: `http-proposal-${runId}`,
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.action.status, 'PROPOSED');
    assert.equal(result.body.action.organization_id, orgId);
    assert.equal(result.body.action.requested_by_actor_id, actorIds.operator);

    const replay = await request(token, 'POST', '/api/v2/actions', {
      workItemId, actionType: 'INSPECT_ASSET', consequenceClass: 'OBSERVATIONAL',
      idempotencyKey: `http-proposal-${runId}`,
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.body.action.id, result.body.action.id);
  });

  test('Owner can authorize, while forged authorization identity is impossible at the route', async () => {
    const token = await signIn('operator');
    const created = await request(token, 'POST', '/api/v2/actions', {
      workItemId, actionType: 'CONTACT_CUSTOMER', consequenceClass: 'COMMUNICATION',
      idempotencyKey: `http-authorize-${runId}`,
    });
    assert.equal(created.status, 201);
    const actionId = created.body.action.id;

    const ownerToken = await signIn('owner');
    const authorized = await request(ownerToken, 'POST', `/api/v2/actions/${actionId}/authorize`, {});
    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.action.status, 'AUTHORIZED');
    assert.equal(authorized.body.action.authorized_by_actor_id, actorIds.owner);
  });

  test('Operator cannot authorize without action.authorize permission', async () => {
    const operatorToken = await signIn('operator');
    const created = await request(operatorToken, 'POST', '/api/v2/actions', {
      workItemId, actionType: 'CONTACT_CUSTOMER', consequenceClass: 'COMMUNICATION',
      idempotencyKey: `http-denied-${runId}`,
    });
    assert.equal(created.status, 201);
    const denied = await request(operatorToken, 'POST', `/api/v2/actions/${created.body.action.id}/authorize`, {});
    assert.equal(denied.status, 403);
  });

  test('authorized action executes through attempt completion and final success', async () => {
    const operatorToken = await signIn('operator');
    const created = await request(operatorToken, 'POST', '/api/v2/actions', {
      workItemId, actionType: 'PERFORM_FIELD_CHECK', consequenceClass: 'OPERATIONAL',
      idempotencyKey: `http-full-loop-${runId}`,
    });
    assert.equal(created.status, 201);
    const actionId = created.body.action.id;

    const ownerToken = await signIn('owner');
    const authorized = await request(ownerToken, 'POST', `/api/v2/actions/${actionId}/authorize`, {});
    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.action.status, 'AUTHORIZED');

    const technicianToken = await signIn('technician');
    const executing = await request(technicianToken, 'POST', `/api/v2/actions/${actionId}/transition`, { status: 'EXECUTING' });
    assert.equal(executing.status, 200);
    assert.equal(executing.body.action.status, 'EXECUTING');

    const attempt = await request(technicianToken, 'POST', `/api/v2/actions/${actionId}/attempts`, {
      attemptNumber: 1,
      executionIdempotencyKey: `http-full-loop-attempt-${runId}`,
    });
    assert.equal(attempt.status, 201);
    assert.equal(attempt.body.attempt.status, 'CREATED');

    const attemptExecuting = await request(
      technicianToken,
      'POST',
      `/api/v2/actions/${actionId}/attempts/${attempt.body.attempt.id}/transition`,
      { status: 'EXECUTING' },
    );
    assert.equal(attemptExecuting.status, 200);
    assert.equal(attemptExecuting.body.attempt.status, 'EXECUTING');

    const attemptSucceeded = await request(
      technicianToken,
      'POST',
      `/api/v2/actions/${actionId}/attempts/${attempt.body.attempt.id}/transition`,
      {
        status: 'SUCCEEDED',
        result: {
          resultCode: 'FIELD_CHECK_COMPLETE',
          resultSummary: 'Field check completed successfully.',
        },
      },
    );
    assert.equal(attemptSucceeded.status, 200);
    assert.equal(attemptSucceeded.body.attempt.status, 'SUCCEEDED');

    const actionSucceeded = await request(
      technicianToken,
      'POST',
      `/api/v2/actions/${actionId}/transition`,
      { status: 'SUCCEEDED' },
    );
    assert.equal(actionSucceeded.status, 200);
    assert.equal(actionSucceeded.body.action.status, 'SUCCEEDED');
  });

  test('missing bearer token is rejected before Action mutation', async () => {
    const result = await request('', 'POST', '/api/v2/actions', {
      workItemId, actionType: 'INSPECT_ASSET', consequenceClass: 'OBSERVATIONAL',
      idempotencyKey: `http-unauth-${runId}`,
    });
    assert.equal(result.status, 401);
  });
}
