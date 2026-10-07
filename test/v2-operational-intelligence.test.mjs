import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createCustomerOperationalIssuesRouter } from '../server/src/routes/customerOperationalIssues.js';
import { createVerificationsRouter } from '../server/src/routes/verifications.js';
import { createOperationsRouter } from '../server/src/routes/operations.js';

const url = process.env.V2_SUPABASE_URL;
const serviceRoleKey = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.V2_SUPABASE_ANON_KEY;
const enabled = Boolean(url && serviceRoleKey && anonKey);

test('operational intelligence gate is configured', () => {
  if (!enabled) assert.ok(true, 'Set V2 Supabase environment variables to run the live operational gate.');
});

if (enabled) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const runId = Date.now().toString(36);
  const password = `Operational_Gate_${runId}_Secure!123`;
  const email = `operational-gate-${runId}@example.invalid`;
  const state = { userId: '', actorId: '', orgId: '' };
  let server;
  let baseUrl;

  async function signIn() {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    assert.ifError(error);
    assert.ok(data.session?.access_token);
    return data.session.access_token;
  }

  async function request(path, token, body, organizationId = state.orgId) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-organization-id': organizationId,
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  before(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Operational Gate' },
    });
    assert.ifError(error);
    state.userId = data.user.id;

    const token = await signIn();
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: org, error: orgError } = await authClient.rpc('create_organization', {
      p_name: `Operational Gate ${runId}`,
      p_creator_intent: 'OWNER',
    });
    assert.ifError(orgError);
    state.orgId = org.id;

    const { data: actor, error: actorError } = await admin
      .from('actors')
      .select('id')
      .eq('auth_user_id', state.userId)
      .single();
    assert.ifError(actorError);
    state.actorId = actor.id;

    const { data: profile, error: profileError } = await admin
      .from('operating_model_profiles')
      .select('id')
      .eq('organization_id', state.orgId)
      .single();
    assert.ifError(profileError);

    const { error: modelError } = await admin.from('operating_model_business_models').insert([
      { organization_id: state.orgId, operating_model_profile_id: profile.id, business_model_key: 'EPC', is_primary: true },
      { organization_id: state.orgId, operating_model_profile_id: profile.id, business_model_key: 'ENERGY_AS_A_SERVICE', is_primary: false },
    ]);
    assert.ifError(modelError);

    const { error: capabilityError } = await admin.from('organization_capabilities').insert([
      { organization_id: state.orgId, capability_key: 'FIELD_SERVICE', status: 'ENABLED', configuration: { dispatch_window_hours: 24 } },
      { organization_id: state.orgId, capability_key: 'CUSTOMER_SUPPORT', status: 'ENABLED', configuration: {} },
    ]);
    assert.ifError(capabilityError);

    const app = express();
    app.use(express.json());
    app.use('/api/operational-issues', createCustomerOperationalIssuesRouter(admin));
    app.use('/api/verifications', createVerificationsRouter(admin));
    app.use('/api/operations', createOperationsRouter(admin));

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
    if (state.orgId) await admin.from('organizations').delete().eq('id', state.orgId);
    if (state.actorId) await admin.from('actors').delete().eq('id', state.actorId);
    if (state.userId) await admin.auth.admin.deleteUser(state.userId);
  });

  test('issue intake works for a mixed operating-model organization', async () => {
    const token = await signIn();
    const result = await request('/api/operational-issues', token, {
      title: 'Mixed-model asset issue',
      summary: 'An operational exception is reported for a customer asset.',
      severity: 'HIGH',
      priority: 'HIGH',
      workType: 'VISIT_SITE',
      observationType: 'CUSTOMER_REPORT',
      observationValue: { symptom: 'asset not operating' },
      source: 'WEB',
      idempotencyKey: `mixed-${runId}`,
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.success, true);
    assert.ok(result.body.situationId);
    assert.ok(result.body.workItemId);
  });

  test('operational queue returns tenant-scoped attention metrics', async () => {
    const token = await signIn();
    const response = await fetch(`${baseUrl}/api/operations/queue`, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-organization-id': state.orgId,
      },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.organizationId, state.orgId);
    assert.equal(typeof body.metrics.openSituations, 'number');
    assert.equal(typeof body.metrics.criticalSituations, 'number');
    assert.equal(typeof body.metrics.highPriorityWork, 'number');
    assert.equal(typeof body.metrics.unassignedWork, 'number');
    assert.equal(typeof body.metrics.overdueWork, 'number');
    assert.ok(Array.isArray(body.situations));
  });

  test('recommendation reflects capabilities rather than an EPC/PAYGo branch', async () => {
    const token = await signIn();
    const result = await request('/api/operational-issues', token, {
      title: 'Field investigation required',
      summary: 'The organization needs a field response to a reported condition.',
      severity: 'HIGH',
      priority: 'HIGH',
      workType: 'VISIT_SITE',
      observationType: 'CUSTOMER_REPORT',
      observationValue: { symptom: 'field_investigation_required' },
      source: 'WEB',
      idempotencyKey: `recommendation-${runId}`,
    });

    assert.equal(result.status, 201);

    const { data: recommendation, error } = await admin
      .from('recommendations')
      .select('recommendation_type,summary,confidence,context_snapshot')
      .eq('organization_id', state.orgId)
      .eq('situation_id', result.body.situationId)
      .single();

    assert.ifError(error);
    assert.equal(recommendation.recommendation_type, 'FIELD_INVESTIGATION');
    assert.ok(recommendation.summary.includes('field responsibility'));
    assert.deepEqual(recommendation.context_snapshot.capabilities, ['FIELD_SERVICE', 'CUSTOMER_SUPPORT']);
    assert.deepEqual(recommendation.context_snapshot.businessModels, ['EPC', 'ENERGY_AS_A_SERVICE']);
  });

  test('verification closes the situation through the authenticated HTTP boundary', async () => {
    const token = await signIn();
    const result = await request('/api/operational-issues', token, {
      title: 'Verification loop test',
      summary: 'A situation that should be closed through verified evidence.',
      severity: 'MEDIUM',
      priority: 'NORMAL',
      workType: 'INVESTIGATE',
      observationType: 'CUSTOMER_REPORT',
      observationValue: { symptom: 'verification_loop' },
      source: 'WEB',
      idempotencyKey: `verification-${runId}`,
    });

    assert.equal(result.status, 201);

    const verification = await request('/api/verifications', token, {
      situationId: result.body.situationId,
      workItemId: result.body.workItemId,
      verificationType: 'OPERATOR_CONFIRMATION',
      status: 'VERIFIED',
      result: { summary: 'Outcome confirmed by operational gate.' },
    });

    assert.equal(verification.status, 201);
    assert.equal(verification.body.success, true);
    assert.equal(verification.body.verification.verification_status, 'VERIFIED');
    assert.equal(verification.body.verification.situation_status, 'RESOLVED');

    const { data: situation, error } = await admin
      .from('situations')
      .select('status,resolved_at,resolution_summary')
      .eq('organization_id', state.orgId)
      .eq('id', result.body.situationId)
      .single();
    assert.ifError(error);
    assert.equal(situation.status, 'RESOLVED');
    assert.ok(situation.resolved_at);
  });

  test('operational queue rejects a forged organization context before intelligence retrieval', async () => {
    const token = await signIn();
    const response = await fetch(`${baseUrl}/api/operations/queue`, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-organization-id': crypto.randomUUID(),
      },
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, 'MEMBERSHIP_NOT_FOUND');
  });

  test('forged organization header is denied by tenant resolution', async () => {
    const token = await signIn();
    const result = await request('/api/operational-issues', token, {
      title: 'Cross-tenant test',
      observationValue: { test: true },
      idempotencyKey: `forged-${runId}`,
    }, crypto.randomUUID());
    assert.equal(result.status, 403);
  });
}
