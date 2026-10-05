import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.V2_SUPABASE_URL;
const serviceRoleKey = process.env.V2_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.V2_SUPABASE_ANON_KEY;
const enabled = Boolean(url && serviceRoleKey && anonKey);

test('V2 self-service onboarding gate is configured', () => {
  if (!enabled) {
    assert.ok(true, 'Set V2_SUPABASE_URL, V2_SUPABASE_ANON_KEY and V2_SUPABASE_SERVICE_ROLE_KEY to run the live onboarding gate.');
  }
});

if (enabled) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now().toString(36);
  const password = `V2_Onboarding_Gate_${runId}_Secure!123`;
  const state = {
    users: [],
    orgs: [],
    actorIds: [],
    membershipIds: [],
  };

  async function createUser(label) {
    const email = `v2-onboarding-${label}-${runId}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `V2 Gate ${label}` },
    });
    assert.ifError(error);
    state.users.push(data.user.id);
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

  async function cleanup() {
    for (const orgId of state.orgs) {
      await admin.from('organization_invitations').delete().eq('organization_id', orgId);
      await admin.from('memberships').delete().eq('organization_id', orgId);
      await admin.from('organizations').delete().eq('id', orgId);
    }
    for (const actorId of state.actorIds) {
      await admin.from('actors').delete().eq('id', actorId);
    }
    for (const userId of state.users) {
      await admin.auth.admin.deleteUser(userId);
    }
  }

  let owner;
  let operator;
  let secondOwner;
  let orgOwner;
  let orgDelegated;

  before(async () => {
    owner = await createUser('owner');
    operator = await createUser('operator');
    secondOwner = await createUser('second-owner');

    const ownerClient = await signIn(owner);
    const { data: ownerOrg, error: ownerOrgError } = await ownerClient.rpc('create_organization', {
      p_name: `V2 Gate Owner ${runId}`,
      p_creator_intent: 'OWNER',
    });
    assert.ifError(ownerOrgError);
    assert.equal(ownerOrg.onboarding_state, 'ACTIVE');
    orgOwner = ownerOrg.id;
    state.orgs.push(orgOwner);

    const delegatedClient = await signIn(operator);
    const { data: delegatedOrg, error: delegatedOrgError } = await delegatedClient.rpc('create_organization', {
      p_name: `V2 Gate Delegated ${runId}`,
      p_creator_intent: 'DELEGATED_OPERATOR',
    });
    assert.ifError(delegatedOrgError);
    assert.equal(delegatedOrg.onboarding_state, 'PENDING_AUTHORITY');
    orgDelegated = delegatedOrg.id;
    state.orgs.push(orgDelegated);
  });

  after(cleanup);

  test('owner-led self-service creates actor, tenant and OWNER membership', async () => {
    const { data: org, error } = await admin
      .from('organizations')
      .select('id,created_by_actor_id,onboarding_state')
      .eq('id', orgOwner)
      .single();
    assert.ifError(error);
    assert.equal(org.onboarding_state, 'ACTIVE');
    assert.ok(org.created_by_actor_id);

    const { data: membership, error: membershipError } = await admin
      .from('memberships')
      .select('id,actor_id,status,roles(key)')
      .eq('organization_id', orgOwner)
      .single();
    assert.ifError(membershipError);
    assert.equal(membership.status, 'ACTIVE');
    assert.equal(membership.roles.key, 'OWNER');

    state.actorIds.push(org.created_by_actor_id);
    state.membershipIds.push(membership.id);
  });

  test('delegated creator is not silently converted into OWNER', async () => {
    const { data: membership, error } = await admin
      .from('memberships')
      .select('id,actor_id,status,roles(key)')
      .eq('organization_id', orgDelegated)
      .single();
    assert.ifError(error);
    assert.equal(membership.status, 'ACTIVE');
    assert.equal(membership.roles.key, 'OPERATOR');

    const { data: org } = await admin
      .from('organizations')
      .select('created_by_actor_id,onboarding_state')
      .eq('id', orgDelegated)
      .single();
    assert.equal(org.onboarding_state, 'PENDING_AUTHORITY');
    state.actorIds.push(org.created_by_actor_id);
    state.membershipIds.push(membership.id);
  });

  test('delegated operator can invite a responsible owner who claims the workspace', async () => {
    const delegatedClient = await signIn(operator);
    const { data: invite, error: inviteError } = await delegatedClient.rpc(
      'create_organization_invitation',
      {
        p_organization_id: orgDelegated,
        p_email: secondOwner.email,
        p_purpose: 'OWNER_CLAIM',
        p_role_key: 'OWNER',
      }
    );
    assert.ifError(inviteError);
    assert.ok(invite?.token);

    const secondOwnerClient = await signIn(secondOwner);
    const { data: claimed, error: claimError } = await secondOwnerClient.rpc(
      'accept_organization_invitation',
      { p_token: invite.token }
    );
    assert.ifError(claimError);
    assert.equal(claimed.status, 'ACTIVE');

    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('onboarding_state')
      .eq('id', orgDelegated)
      .single();
    assert.ifError(orgError);
    assert.equal(org.onboarding_state, 'ACTIVE');

    const { data: owners, error: ownerError } = await admin
      .from('memberships')
      .select('actor_id,roles(key)')
      .eq('organization_id', orgDelegated)
      .eq('status', 'ACTIVE');
    assert.ifError(ownerError);
    assert.ok(owners.some((row) => row.roles.key === 'OWNER'));
  });

  test('ownership can be granted to another active member and multiple owners remain valid', async () => {
    const ownerClient = await signIn(owner);
    const member = await createUser('member');
    const memberClient = await signIn(member);

    const { data: memberActor, error: actorError } = await admin
      .from('actors')
      .select('id')
      .eq('auth_user_id', member.id)
      .single();
    assert.ifError(actorError);
    state.actorIds.push(memberActor.id);

    const { data: operatorRole, error: roleError } = await admin
      .from('roles')
      .select('id')
      .eq('key', 'OPERATOR')
      .single();
    assert.ifError(roleError);

    const { data: membership, error: membershipError } = await admin
      .from('memberships')
      .insert({
        organization_id: orgOwner,
        actor_id: memberActor.id,
        role_id: operatorRole.id,
        status: 'ACTIVE',
      })
      .select('id')
      .single();
    assert.ifError(membershipError);
    state.membershipIds.push(membership.id);

    const { data: result, error: transferError } = await ownerClient.rpc(
      'transfer_organization_ownership',
      {
        p_organization_id: orgOwner,
        p_target_membership_id: membership.id,
        p_demote_current_owner: false,
      }
    );
    assert.ifError(transferError);
    assert.equal(result.target_membership_id, membership.id);

    const { data: roles, error: rolesError } = await admin
      .from('membership_roles')
      .select('membership_id,roles(key)')
      .eq('membership_id', membership.id);
    assert.ifError(rolesError);
    assert.ok(roles.some((row) => row.roles.key === 'OWNER'));

    const { data: owners, error: ownersError } = await admin
      .from('membership_roles')
      .select('membership_id,memberships!inner(organization_id,status),roles!inner(key)')
      .eq('memberships.organization_id', orgOwner)
      .eq('memberships.status', 'ACTIVE')
      .eq('roles.key', 'OWNER');
    assert.ifError(ownersError);
    assert.ok(owners.length >= 2);

    // Member now has two responsibilities: primary OPERATOR + OWNER.
    const { error: demoteError } = await memberClient
      .from('memberships')
      .update({ role_id: operatorRole.id })
      .eq('id', membership.id);
    assert.ifError(demoteError);

    const { data: ownerAssignments } = await admin
      .from('membership_roles')
      .select('role_id,roles(key)')
      .eq('membership_id', membership.id);
    assert.ok(ownerAssignments.some((row) => row.roles.key === 'OWNER'));
  });

  test('final active OWNER cannot be removed or demoted', async () => {
    const { data: owners, error } = await admin
      .from('membership_roles')
      .select('membership_id,memberships!inner(organization_id,status),roles!inner(key)')
      .eq('memberships.organization_id', orgDelegated)
      .eq('memberships.status', 'ACTIVE')
      .eq('roles.key', 'OWNER');
    assert.ifError(error);
    assert.ok(owners.length >= 1);

    const finalOwnerMembership = owners[0].membership_id;
    const { data: operatorRole, error: roleError } = await admin
      .from('roles')
      .select('id')
      .eq('key', 'OPERATOR')
      .single();
    assert.ifError(roleError);

    const { error: directDemoteError } = await admin
      .from('memberships')
      .update({ role_id: operatorRole.id })
      .eq('id', finalOwnerMembership);
    assert.ok(directDemoteError, 'database invariant must reject removal of the final OWNER');
  });

  test('tenant isolation remains enforced between two organizations', async () => {
    const { data: ownerActor, error: ownerActorError } = await admin
      .from('actors')
      .select('id')
      .eq('auth_user_id', owner.id)
      .single();
    assert.ifError(ownerActorError);

    const { data: ownerClientSession, error: sessionError } = await (async () => {
      const c = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
      return c.auth.signInWithPassword({ email: owner.email, password });
    })();
    assert.ifError(sessionError);
    assert.ok(ownerClientSession.session);

    const scoped = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${ownerClientSession.session.access_token}` } },
    });

    const { data: otherOrgRows, error: otherOrgError } = await scoped
      .from('organizations')
      .select('id')
      .eq('id', orgDelegated);
    assert.ifError(otherOrgError);
    assert.deepEqual(otherOrgRows, []);

    const { data: ownRows, error: ownError } = await scoped
      .from('organizations')
      .select('id')
      .eq('id', orgOwner);
    assert.ifError(ownError);
    assert.equal(ownRows.length, 1);
    assert.equal(ownRows[0].id, orgOwner);

    assert.ok(ownerActor.id);
  });
}
