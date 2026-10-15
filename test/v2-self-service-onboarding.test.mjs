import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const onboardingApiUrl = process.env.ONBOARDING_TEST_API_URL?.replace(/\/+$/, '');
const enabled = Boolean(url && serviceRoleKey && anonKey && onboardingApiUrl);
if (!enabled && process.env.REQUIRE_ONBOARDING_TEST_INTEGRATION === 'true') {
  throw new Error(
    'REQUIRE_ONBOARDING_TEST_INTEGRATION=true requires isolated SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY and ONBOARDING_TEST_API_URL. The API must use the same disposable test Supabase project; production credentials are not accepted.'
  );
}

test('self-service onboarding integration requires an isolated Supabase project and its API', { skip: !enabled }, () => {
  assert.ok(
    enabled,
    'Configure isolated SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY and ONBOARDING_TEST_API_URL. The API must target the same disposable test project; do not point this test at production.'
  );
});

if (enabled) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now().toString(36);
  const password = `Onboarding_Gate_${runId}_Secure!123`;
  const state = {
    users: [],
    orgs: [],
    actorIds: [],
    membershipIds: [],
  };

  async function createUser(label) {
    const email = `onboarding-gate-${label}-${runId}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Onboarding Gate ${label}` },
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
    return { client, accessToken: data.session.access_token };
  }

  async function postOnboarding(path, accessToken, body) {
    const response = await fetch(`${onboardingApiUrl}/api/onboarding/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  async function createOrganization(user, body) {
    const { accessToken } = await signIn(user);
    const { response, payload } = await postOnboarding('organizations', accessToken, body);
    assert.equal(response.status, 201, JSON.stringify(payload));
    assert.ok(payload.organization?.id, 'API must return the created organization');
    return payload;
  }

  async function cleanup() {
    for (const orgId of state.orgs) {
      await admin.from('organization_invitations').delete().eq('organization_id', orgId);
      await admin.from('memberships').delete().eq('organization_id', orgId);
      await admin.from('organizations').delete().eq('id', orgId);
    }
    for (const userId of state.users) {
      await admin.from('actors').delete().eq('auth_user_id', userId);
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
  let delegatedOwnerClaimToken;

  before(async () => {
    owner = await createUser('owner');
    operator = await createUser('operator');
    secondOwner = await createUser('second-owner');

    const ownerSetup = await createOrganization(owner, {
      name: `Onboarding Gate Owner ${runId}`,
      intent: 'OWNER',
    });
    assert.equal(ownerSetup.organization.onboarding_state, 'ACTIVE');
    orgOwner = ownerSetup.organization.id;
    state.orgs.push(orgOwner);

    const delegatedSetup = await createOrganization(operator, {
      name: `Onboarding Gate Delegated ${runId}`,
      intent: 'DELEGATED_OPERATOR',
      ownerEmail: secondOwner.email,
    });
    assert.equal(delegatedSetup.organization.onboarding_state, 'PENDING_AUTHORITY');
    assert.ok(delegatedSetup.invitation?.token);
    delegatedOwnerClaimToken = delegatedSetup.invitation.token;
    orgDelegated = delegatedSetup.organization.id;
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
    assert.ok(delegatedOwnerClaimToken, 'atomic delegated onboarding must issue an owner-claim token');

    const { accessToken } = await signIn(secondOwner);
    const { response, payload: claimed } = await postOnboarding(
      'invitations/accept',
      accessToken,
      { token: delegatedOwnerClaimToken }
    );
    assert.equal(response.status, 200, JSON.stringify(claimed));
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
    const { client: ownerClient } = await signIn(owner);
    const member = await createUser('member');
    const { client: memberClient } = await signIn(member);

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

    const { error: demotionTransferError } = await ownerClient.rpc(
      'transfer_organization_ownership',
      {
        p_organization_id: orgOwner,
        p_target_membership_id: membership.id,
        p_demote_current_owner: true,
      }
    );
    assert.ifError(demotionTransferError);

    const { data: remainingOwners, error: remainingOwnersError } = await admin
      .from('membership_roles')
      .select('membership_id,memberships!inner(organization_id,status),roles!inner(key)')
      .eq('memberships.organization_id', orgOwner)
      .eq('memberships.status', 'ACTIVE')
      .eq('roles.key', 'OWNER');
    assert.ifError(remainingOwnersError);
    assert.equal(remainingOwners.length, 1);
    assert.equal(remainingOwners[0].membership_id, membership.id);
  });

  test('final active OWNER cannot be removed or demoted', async () => {
    const { data: owners, error } = await admin
      .from('membership_roles')
      .select('membership_id,memberships!inner(organization_id,status),roles!inner(key)')
      .eq('memberships.organization_id', orgDelegated)
      .eq('memberships.status', 'ACTIVE')
      .eq('roles.key', 'OWNER');
    assert.ifError(error);
    assert.equal(owners.length, 1);

    const { client: brianClient } = await signIn(secondOwner);
    const { error: demotionError } = await brianClient.rpc(
      'transfer_organization_ownership',
      {
        p_organization_id: orgDelegated,
        p_target_membership_id: owners[0].membership_id,
        p_demote_current_owner: true,
      }
    );

    assert.ok(
      demotionError,
      'the final OWNER must not be demoted even when the caller is attempting an explicit ownership transfer'
    );
    assert.match(demotionError.message, /FINAL_OWNER_CANNOT_BE_DEMOTED/);
  });

  test('tenant isolation remains enforced between two organizations', async () => {
    const { data: ownerActor, error: ownerActorError } = await admin
      .from('actors')
      .select('id')
      .eq('auth_user_id', owner.id)
      .single();
    assert.ifError(ownerActorError);

    const { accessToken } = await signIn(owner);
    const scoped = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
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
