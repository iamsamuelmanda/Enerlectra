import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && serviceRoleKey);
if (!enabled && process.env.REQUIRE_LIVE_INTEGRATION === 'true') {
  throw new Error('REQUIRE_LIVE_INTEGRATION=true but Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. are not all configured');
}

test('operational verification evidence live integration gate is configured', { skip: !enabled }, () => {
  assert.ok(enabled, 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
});

if (enabled) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const runId = Date.now().toString(36);
  const password = `Verification_Evidence_${runId}_Secure!`;
  const tenants = {};
  const authUsers = {};
  const actors = {};
  const situations = {};
  const observations = {};
  const events = {};

  async function createTenant(label) {
    const email = `verification-evidence-${label}-${runId}@example.invalid`;
    const { data: auth, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(authError);
    authUsers[label] = auth.user.id;

    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({ name: `Verification Evidence ${label} ${runId}`, status: 'ACTIVE', onboarding_state: 'ACTIVE' })
      .select('id')
      .single();
    assert.ifError(orgError);
    tenants[label] = org.id;

    const { data: actor, error: actorError } = await admin
      .from('actors')
      .insert({ auth_user_id: auth.user.id, status: 'ACTIVE', display_name: `Verification Evidence ${label}` })
      .select('id')
      .single();
    assert.ifError(actorError);
    actors[label] = actor.id;

    const { data: role, error: roleError } = await admin.from('roles').select('id').eq('key', 'OWNER').single();
    assert.ifError(roleError);

    const { error: membershipError } = await admin.from('memberships').insert({
      organization_id: org.id,
      actor_id: actor.id,
      role_id: role.id,
      status: 'ACTIVE',
    });
    assert.ifError(membershipError);
  }

  async function createSituation(label) {
    const { data, error } = await admin.from('situations').insert({
      organization_id: tenants.a,
      situation_type: 'VERIFICATION_EVIDENCE_REGRESSION',
      status: 'OPEN',
      severity: 'LOW',
      title: `Verification evidence ${label} ${runId}`,
      summary: 'Temporary automated regression fixture',
      opened_at: new Date(Date.now() - 60_000).toISOString(),
    }).select('id').single();
    assert.ifError(error);
    situations[label] = data.id;
  }

  async function createObservation(label, tenantLabel, observationType, observedAt = new Date().toISOString()) {
    const { data, error } = await admin.from('observations').insert({
      organization_id: tenants[tenantLabel],
      actor_id: actors[tenantLabel],
      source: 'VERIFICATION_EVIDENCE_REGRESSION_TEST',
      observation_type: observationType,
      observed_at: observedAt,
      value: { test: true, runId, label },
      provenance: { test: true, source: 'automated regression' },
    }).select('id').single();
    assert.ifError(error);
    observations[label] = data.id;
  }

  async function createEvent(label, tenantLabel) {
    const { data, error } = await admin.from('events').insert({
      organization_id: tenants[tenantLabel],
      actor_id: actors[tenantLabel],
      event_type: 'VERIFICATION_EVIDENCE_REGRESSION_TEST',
      occurred_at: new Date().toISOString(),
      source: 'VERIFICATION_EVIDENCE_REGRESSION_TEST',
      payload: { test: true, runId, label },
      provenance: { test: true, source: 'automated regression' },
    }).select('id').single();
    assert.ifError(error);
    events[label] = data.id;
  }

  async function verify({ situationId, status = 'VERIFIED', observationId = null, eventId = null }) {
    return admin.rpc('record_operational_verification', {
      p_organization_id: tenants.a,
      p_actor_id: actors.a,
      p_situation_id: situationId,
      p_work_item_id: null,
      p_action_id: null,
      p_verification_type: 'OPERATOR_CONFIRMATION',
      p_status: status,
      p_result: { summary: 'automated verification regression' },
      p_observation_id: observationId,
      p_event_id: eventId,
    });
  }

  async function assertSituationStatus(id, expectedStatus) {
    const { data, error } = await admin.from('situations').select('status').eq('id', id).single();
    assert.ifError(error);
    assert.equal(data.status, expectedStatus);
  }

  async function assertNoVerification(id) {
    const { data, error } = await admin.from('verifications').select('id').eq('situation_id', id);
    assert.ifError(error);
    assert.deepEqual(data, []);
  }

  function assertDatabaseError(error, code) {
    assert.ok(error, `Expected database rejection ${code}`);
    assert.match(error.message, new RegExp(code));
  }

  before(async () => {
    await createTenant('a');
    await createTenant('b');

    for (const label of ['no-evidence', 'valid', 'cross-observation', 'cross-event', 'initial-report', 'stale']) {
      await createSituation(label);
    }

    await createObservation('valid', 'a', 'OUTCOME_CONFIRMATION');
    await createObservation('cross-tenant', 'b', 'OUTCOME_CONFIRMATION');
    await createObservation('initial-report', 'a', 'INITIAL_REPORT');
    await createObservation('stale', 'a', 'OUTCOME_CONFIRMATION', new Date(Date.now() - 10 * 60_000).toISOString());
    await createEvent('cross-tenant', 'b');
  });

  after(async () => {
    // Remove tenant-owned fixtures first; then actor and Auth fixtures.
    for (const orgId of Object.values(tenants)) {
      const { error } = await admin.from('organizations').delete().eq('id', orgId);
      assert.ifError(error);
    }
    for (const actorId of Object.values(actors)) {
      const { error } = await admin.from('actors').delete().eq('id', actorId);
      assert.ifError(error);
    }
    for (const userId of Object.values(authUsers)) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      assert.ifError(error);
    }
  });

  test('summary-only VERIFIED request is rejected without changing persisted state', async () => {
    const { data, error } = await verify({ situationId: situations['no-evidence'] });
    assert.equal(data, null);
    assertDatabaseError(error, 'VERIFICATION_OUTCOME_EVIDENCE_REQUIRED');
    await assertSituationStatus(situations['no-evidence'], 'OPEN');
    await assertNoVerification(situations['no-evidence']);
  });

  test('fresh same-tenant outcome evidence persists verification and resolves situation', async () => {
    const { data, error } = await verify({
      situationId: situations.valid,
      observationId: observations.valid,
    });
    assert.ifError(error);
    const row = Array.isArray(data) ? data[0] : data;
    assert.ok(row?.verification_id);
    assert.equal(row.verification_status, 'VERIFIED');
    assert.equal(row.situation_status, 'RESOLVED');

    const { data: persisted, error: readError } = await admin
      .from('verifications')
      .select('id,observation_id,status')
      .eq('id', row.verification_id)
      .single();
    assert.ifError(readError);
    assert.equal(persisted.observation_id, observations.valid);
    assert.equal(persisted.status, 'VERIFIED');
    await assertSituationStatus(situations.valid, 'RESOLVED');
  });

  test('cross-tenant observation is rejected even for PARTIAL status', async () => {
    const { data, error } = await verify({
      situationId: situations['cross-observation'],
      status: 'PARTIAL',
      observationId: observations['cross-tenant'],
    });
    assert.equal(data, null);
    assertDatabaseError(error, 'VERIFICATION_EVIDENCE_NOT_FOUND');
    await assertSituationStatus(situations['cross-observation'], 'OPEN');
    await assertNoVerification(situations['cross-observation']);
  });

  test('cross-tenant event is rejected even for FAILED status', async () => {
    const { data, error } = await verify({
      situationId: situations['cross-event'],
      status: 'FAILED',
      eventId: events['cross-tenant'],
    });
    assert.equal(data, null);
    assertDatabaseError(error, 'VERIFICATION_EVENT_NOT_FOUND');
    await assertSituationStatus(situations['cross-event'], 'OPEN');
    await assertNoVerification(situations['cross-event']);
  });

  test('initial-report observation cannot establish a verified outcome', async () => {
    const { data, error } = await verify({
      situationId: situations['initial-report'],
      observationId: observations['initial-report'],
    });
    assert.equal(data, null);
    assertDatabaseError(error, 'VERIFICATION_OUTCOME_EVIDENCE_REQUIRED');
    await assertSituationStatus(situations['initial-report'], 'OPEN');
    await assertNoVerification(situations['initial-report']);
  });

  test('outcome observation predating the situation cannot resolve it', async () => {
    const { data, error } = await verify({
      situationId: situations.stale,
      observationId: observations.stale,
    });
    assert.equal(data, null);
    assertDatabaseError(error, 'VERIFICATION_OUTCOME_EVIDENCE_REQUIRED');
    await assertSituationStatus(situations.stale, 'OPEN');
    await assertNoVerification(situations.stale);
  });
}
