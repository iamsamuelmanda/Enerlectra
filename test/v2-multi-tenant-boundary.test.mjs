import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const apiBaseUrl = (process.env.ONBOARDING_TEST_API_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
const enabled = Boolean(url && serviceRoleKey && anonKey);
if (!enabled && process.env.REQUIRE_LIVE_INTEGRATION === 'true') {
  throw new Error('REQUIRE_LIVE_INTEGRATION=true but Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. are not all configured');
}

test('V2 multi-tenant live integration gate is configured', { skip: !enabled }, () => {
  assert.ok(enabled, 'SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.');
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
    assert.ok(data.session?.access_token, 'sign-in must return an access token');
    return { client, accessToken: data.session.access_token };
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

    const signedIn = await signIn(label);
    const response = await fetch(`${apiBaseUrl}/api/operational-issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${signedIn.accessToken}`,
        'content-type': 'application/json',
        'x-organization-id': org.id,
      },
      body: JSON.stringify({
        title: `Tenant ${label} situation`,
        summary: `isolated tenant test ${label}`,
        severity: 'HIGH',
        customerId: customer.id,
        siteId: site.id,
        observationType: 'MULTI_TENANT_GATE',
        observationValue: { label, runId },
        source: 'test',
        workType: 'INVESTIGATE',
        priority: 'HIGH',
        idempotencyKey: `multi-tenant-${label}-${runId}`,
      }),
    });
    const issue = await response.json();
    assert.equal(response.status, 201, `operational issue API failed: ${JSON.stringify(issue)}`);
    assert.ok(issue.situationId);
    assert.ok(issue.workItemId);
    situationIds[label] = issue.situationId;
    workItemIds[label] = issue.workItemId;
  }

  async function selectVisible(client, table, id) {
    const columns = table === 'organizations' ? 'id' : 'id,organization_id';
    const { data, error } = await client.from(table).select(columns).eq('id', id);
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
      const pending = await admin.from('organizations')
        .update({ onboarding_state: 'PENDING_AUTHORITY' }).eq('id', id);
      assert.ifError(pending.error);
      const invitations = await admin.from('organization_invitations').delete().eq('organization_id', id);
      assert.ifError(invitations.error);
      const { data: memberships, error: lookupError } = await admin
        .from('memberships').select('id').eq('organization_id', id);
      assert.ifError(lookupError);
      const membershipIds = (memberships ?? []).map((row) => row.id);
      if (membershipIds.length) {
        const roles = await admin.from('membership_roles').delete().in('membership_id', membershipIds);
        assert.ifError(roles.error);
      }
      const deletedMemberships = await admin.from('memberships').delete().eq('organization_id', id);
      assert.ifError(deletedMemberships.error);
      const deletedOrganization = await admin.from('organizations').delete().eq('id', id);
      assert.ifError(deletedOrganization.error);
    }
    for (const user of Object.values(users)) {
      const actorDelete = await admin.from('actors').delete().eq('auth_user_id', user.id);
      assert.ifError(actorDelete.error);
      const userDelete = await admin.auth.admin.deleteUser(user.id);
      assert.ifError(userDelete.error);
    }
  });

  test('each authenticated tenant sees its own organization and none of the other tenant', async () => {
    const [a, b] = await Promise.all([signIn('a'), signIn('b')]);

    const aOrg = await selectVisible(a.client, 'organizations', orgs.a);
    const aOtherOrg = await selectVisible(a.client, 'organizations', orgs.b);
    const bOrg = await selectVisible(b.client, 'organizations', orgs.b);
    const bOtherOrg = await selectVisible(b.client, 'organizations', orgs.a);

    assert.equal(aOrg.length, 1);
    assert.equal(aOtherOrg.length, 0);
    assert.equal(bOrg.length, 1);
    assert.equal(bOtherOrg.length, 0);
  });

  test('tenant isolation holds across customer, situation and work resources', async () => {
    const [a, b] = await Promise.all([signIn('a'), signIn('b')]);

    for (const [client, own, other] of [
      [a.client, 'a', 'b'],
      [b.client, 'b', 'a'],
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
    const { client: a } = await signIn('a');

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
    const { client: a } = await signIn('a');

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
    assert.equal(persisted.title, `Tenant a situation`);
  });

  test('tenant principals cannot delete the other tenant organization', async () => {
    const { client: a } = await signIn('a');
    const { data, error } = await a.from('organizations').delete().eq('id', orgs.b).select('id');
    assert.ok(error || !data?.length, 'cross-tenant organization delete unexpectedly succeeded');

    const { data: persisted, error: persistedError } = await admin
      .from('organizations').select('id').eq('id', orgs.b).single();
    assert.ifError(persistedError);
    assert.equal(persisted.id, orgs.b);
  });
}
