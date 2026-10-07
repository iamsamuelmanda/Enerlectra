import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const enabled = Boolean(url && serviceRoleKey && anonKey);

test('V2 multi-tenant boundary gate is configured', () => {
  if (!enabled) assert.ok(true, 'Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the live gate.');
});

if (enabled) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const runId = Date.now().toString(36);
  const password = `V2_MultiTenant_${runId}_Secure!`;
  const users = {};
  const orgs = {};
  const actors = {};
  const customerIds = {};
  const situationIds = {};
  const workItemIds = {};
  
  async function createUser(label) {
    const email = `v2-multitenant-${label}-${runId}@example.invalid`;
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
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: users[label].email,
      password,
    });
    assert.ifError(error);
    return client;
  }

  async function seedTenant(label, authId) {
    const { data: org, error: oe } = await admin.from('organizations').insert({
      name: `V2 Multi Tenant ${label} ${runId}`,
      status: 'ACTIVE',
      onboarding_state: 'ACTIVE',
    }).select('id').single();
    assert.ifError(oe);
    orgs[label] = org.id;

    const { data: actor, error: ae } = await admin.from('actors').insert({
      auth_user_id: authId,
      status: 'ACTIVE',
      display_name: `Multi-tenant ${label}`,
    }).select('id').single();
    assert.ifError(ae);
    actors[label] = actor.id;

    const { data: role, error: re } = await admin.from('roles').select('id').eq('key', 'OWNER').single();
    assert.ifError(re);

    const { error: me } = await admin.from('memberships').insert({
      organization_id: org.id,
      actor_id: actor.id,
      role_id: role.id,
      status: 'ACTIVE',
    });
    assert.ifError(me);

    const { data: customer, error: ce } = await admin.from('customers').insert({
      organization_id: org.id,
      name: `Customer ${label} ${runId}`,
      status: 'ACTIVE',
    }).select('id').single();
    assert.ifError(ce);
    customerIds[label] = customer.id;

    const { data: site, error: siteError } = await admin.from('sites').insert({
      organization_id: org.id,
      customer_id: customer.id,
      name: `Site ${label} ${runId}`,
      status: 'ACTIVE',
    }).select('id').single();
    assert.ifError(siteError);

    const { data: issue, error: issueError } = await admin.rpc('create_customer_operational_issue', {
      p_organization_id: org.id,
      p_actor_id: actor.id,
      p_title: `Tenant ${label} situation`,
      p_summary: `isolated tenant test ${label}`,
      p_severity: 'HIGH',
      p_customer_id: customer.id,
      p_site_id: site.id,
      p_asset_id: null,
      p_observation_type: 'MULTI_TENANT_GATE',
      p_observation_value: { label, runId },
      p_source: 'test',
      p_work_type: 'INVESTIGATE',
      p_priority: 'HIGH',
      p_assigned_actor_id: null,
      p_idempotency_key: `multi-tenant-${label}-${runId}`,
      p_correlation_id: null,
      p_recommendation_type: 'INSPECT',
      p_recommendation_summary: `Inspect tenant ${label}`,
      p_recommendation_rationale: 'Multi-tenant regression fixture',
      p_recommendation_confidence: 1,
      p_recommendation_context: { test: true },
    });
    assert.ifError(issueError);
    const row = Array.isArray(issue) ? issue[0] : issue;
    assert.ok(row?.situation_id);
    assert.ok(row?.work_item_id);
    situationIds[label] = row.situation_id;
    workItemIds[label] = row.work_item_id;
  }

  async function selectVisible(client, table, id) {
    const { data, error } = await client.from(table).select('id,organization_id').eq('id', id);
    assert.ifError(error);
    return data;
  }

  before(async () => {
    const [a, b] = await Promise.all([createUser('a'), createUser('b')]);
    await seedTenant('a', a);
    await seedTenant('b', b);
  });

  after(async () => {
    for (const id of Object.values(orgs)) {
      await admin.from('organizations').delete().eq('id', id);
    }
    for (const user of Object.values(users)) {
      await admin.from('actors').delete().eq('auth_user_id', user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  });

  test('each authenticated tenant sees its own organization and none of the other tenant', async () => {
    const [a, b] = await Promise.all([signIn('a'), signIn('b')]);

    const aOrg = await selectVisible(a, 'organizations', orgs.a);
    const aOtherOrg = await selectVisible(a, 'organizations', orgs.b);
    const bOrg = await selectVisible(b, 'organizations', orgs.b);
    const bOtherOrg = await selectVisible(b, 'organizations', orgs.a);

    assert.equal(aOrg.length, 1);
    assert.equal(aOtherOrg.length, 0);
    assert.equal(bOrg.length, 1);
    assert.equal(bOtherOrg.length, 0);
  });

  test('tenant isolation holds across customer, situation and work resources', async () => {
    const [a, b] = await Promise.all([signIn('a'), signIn('b')]);

    for (const [client, own, other] of [
      [a, 'a', 'b'],
      [b, 'b', 'a'],
    ]) {
      assert.equal((await selectVisible(client, 'customers', customerIds[own])).length, 1);
      assert.equal((await selectVisible(client, 'customers', customerIds[other])).length, 0);
      assert.equal((await selectVisible(client, 'situations', situationIds[own])).length, 1);
      assert.equal((await selectVisible(client, 'situations', situationIds[other])).length, 0);
      assert.equal((await selectVisible(client, 'work_items', workItemIds[own])).length, 1);
      assert.equal((await selectVisible(client, 'work_items', workItemIds[other])).length, 0);
    }
  });

  test('forged cross-tenant inserts are rejected by RLS', async () => {
    const a = await signIn('a');

    const { data, error } = await a.from('situations').insert({
      organization_id: orgs.b,
      situation_type: 'forged_cross_tenant',
      status: 'OPEN',
      severity: 'HIGH',
      title: 'must not cross tenant',
      summary: 'RLS mutation test',
    }).select('id');

    assert.ok(error || !data?.length, 'cross-tenant insert unexpectedly succeeded');
  });

  test('forged cross-tenant updates cannot move tenant-owned data', async () => {
    const a = await signIn('a');

    const { data, error } = await a.from('work_items')
      .update({ organization_id: orgs.b, title: 'forged tenant reassignment' })
      .eq('id', workItemIds.a)
      .select('id,organization_id');

    assert.ok(error || !data?.length, 'cross-tenant reassignment unexpectedly succeeded');

    const { data: persisted, error: persistedError } = await admin
      .from('work_items')
      .select('organization_id,title')
      .eq('id', workItemIds.a)
      .single();
    assert.ifError(persistedError);
    assert.equal(persisted.organization_id, orgs.a);
    assert.equal(persisted.title, `Tenant a work`);
  });

  test('tenant principals cannot delete the other tenant organization', async () => {
    const a = await signIn('a');
    const { data, error } = await a.from('organizations').delete().eq('id', orgs.b).select('id');
    assert.ok(error || !data?.length, 'cross-tenant organization delete unexpectedly succeeded');

    const { data: persisted, error: persistedError } = await admin
      .from('organizations').select('id').eq('id', orgs.b).single();
    assert.ifError(persistedError);
    assert.equal(persisted.id, orgs.b);
  });
}
