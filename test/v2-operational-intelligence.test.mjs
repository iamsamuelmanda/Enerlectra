import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

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
  const state = { userId: '', actorId: '', orgId: '' };

  async function createUser() {
    const email = `operational-gate-${runId}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Operational Gate' },
    });
    assert.ifError(error);
    state.userId = data.user.id;
    return { id: data.user.id, email };
  }

  async function signIn(user) {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: user.email,
      password,
    });
    assert.ifError(error);
    assert.ok(data.session?.access_token);
    return client;
  }

  before(async () => {
    const user = await createUser();
    const client = await signIn(user);
    const { data: org, error: orgError } = await client.rpc('create_organization', {
      p_name: `Operational Gate ${runId}`,
      p_creator_intent: 'OWNER',
    });
    assert.ifError(orgError);
    state.orgId = org.id;

    const { data: actor, error: actorError } = await admin
      .from('actors')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();
    assert.ifError(actorError);
    state.actorId = actor.id;
  });

  after(async () => {
    if (state.orgId) await admin.from('organizations').delete().eq('id', state.orgId);
    if (state.actorId) await admin.from('actors').delete().eq('id', state.actorId);
    if (state.userId) await admin.auth.admin.deleteUser(state.userId);
  });

  test('issue intake creates situation, recommendation and work in one tenant', async () => {
    const user = { email: `operational-gate-${runId}@example.invalid` };
    const client = await signIn(user);

    const { data, error } = await client.rpc('create_customer_operational_issue', {
      p_organization_id: state.orgId,
      p_actor_id: state.actorId,
      p_title: 'Gate test: reported site issue',
      p_summary: 'The operator reported an operational exception requiring investigation.',
      p_observation_type: 'CUSTOMER_REPORT',
      p_observation_value: { test: true, symptom: 'site_issue' },
      p_source: 'WEB',
      p_work_type: 'INVESTIGATE',
      p_priority: 'HIGH',
      p_correlation_id: `operational-gate-${runId}`,
    });
    assert.ifError(error);
    assert.ok(data?.[0]?.situation_id);
    assert.ok(data?.[0]?.work_item_id);

    const { data: recommendations, error: recError } = await client
      .from('recommendations')
      .select('situation_id,status,recommendation_type,summary,generated_by')
      .eq('organization_id', state.orgId)
      .eq('situation_id', data[0].situation_id);
    assert.ifError(recError);
    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0].status, 'PROPOSED');
    assert.equal(recommendations[0].generated_by, 'RULE_ENGINE');

    const { data: work, error: workError } = await client
      .from('work_items')
      .select('id,status,work_type,priority')
      .eq('organization_id', state.orgId)
      .eq('id', data[0].work_item_id)
      .single();
    assert.ifError(workError);
    assert.equal(work.work_type, 'INVESTIGATE');

    const { data: verification, error: verificationError } = await client.rpc(
      'record_operational_verification',
      {
        p_organization_id: state.orgId,
        p_actor_id: state.actorId,
        p_situation_id: data[0].situation_id,
        p_work_item_id: data[0].work_item_id,
        p_verification_type: 'OPERATOR_CONFIRMATION',
        p_status: 'VERIFIED',
        p_result: { summary: 'Outcome confirmed by operational gate.' },
      },
    );
    assert.ifError(verificationError);
    assert.equal(verification[0].verification_status, 'VERIFIED');
    assert.equal(verification[0].situation_status, 'RESOLVED');

    const { data: situation, error: situationError } = await client
      .from('situations')
      .select('status,resolved_at,resolution_summary')
      .eq('organization_id', state.orgId)
      .eq('id', data[0].situation_id)
      .single();
    assert.ifError(situationError);
    assert.equal(situation.status, 'RESOLVED');
    assert.ok(situation.resolved_at);

  });
}
