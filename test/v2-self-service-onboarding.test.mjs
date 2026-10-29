import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const allowProduction = process.env.ALLOW_PRODUCTION_ONBOARDING_TESTS === 'true';
const url = process.env.SUPABASE_TEST_URL ?? (allowProduction ? process.env.SUPABASE_URL : undefined);
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? (allowProduction ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? (allowProduction ? process.env.SUPABASE_ANON_KEY : undefined);
const onboardingApiUrl = process.env.ONBOARDING_TEST_API_URL?.replace(/\/+$/, '');
const enabled = Boolean(url && serviceRoleKey && anonKey && onboardingApiUrl);
if (!enabled && process.env.REQUIRE_ONBOARDING_TEST_INTEGRATION === 'true') {
  throw new Error(
    'REQUIRE_ONBOARDING_TEST_INTEGRATION=true requires Supabase URL, anon key, service-role key and ONBOARDING_TEST_API_URL. Use SUPABASE_TEST_* for an isolated project, or explicitly set ALLOW_PRODUCTION_ONBOARDING_TESTS=true to use SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.'
  );
}

test('self-service onboarding integration requires Supabase credentials and its API', { skip: !enabled }, () => {
  assert.ok(
    enabled,
    'Configure SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY and ONBOARDING_TEST_API_URL; or explicitly opt in to operational credentials with ALLOW_PRODUCTION_ONBOARDING_TESTS=true.'
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
    orgNames: [
      `Onboarding Gate Owner ${runId}`,
      `Onboarding Gate Delegated ${runId}`,
    ],
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

  async function postOnboarding(path, accessToken, body, extraHeaders = {}) {
    const response = await fetch(`${onboardingApiUrl}/api/onboarding/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
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
    const discoveredOrgIds = new Set(state.orgs);
    // Recover organizations created by the API if a response was lost before its ID was recorded.
    for (const name of state.orgNames) {
      const { data, error } = await admin.from('organizations').select('id').eq('name', name);
      if (error) throw new Error(`Failed to discover test organization during cleanup: ${error.message}`);
      for (const org of data ?? []) discoveredOrgIds.add(org.id);
    }
    for (const orgId of discoveredOrgIds) {
      // The owner invariant intentionally blocks deleting the final owner of an
      // active organization. Mark test tenants pending before cascading cleanup.
      const pending = await admin.from('organizations')
        .update({ onboarding_state: 'PENDING_AUTHORITY' })
        .eq('id', orgId);
      if (pending.error) throw new Error(`Failed to prepare test organization cleanup: ${pending.error.message}`);
      const invitationDelete = await admin.from('organization_invitations').delete().eq('organization_id', orgId);
      if (invitationDelete.error) throw new Error(`Failed to clean test invitations: ${invitationDelete.error.message}`);
      // Remove role rows while their parent memberships still exist. The deferred
      // invariant trigger needs the parent organization ID when evaluating role deletes.
      const { data: memberships, error: membershipLookupError } = await admin
        .from('memberships').select('id').eq('organization_id', orgId);
      if (membershipLookupError) throw new Error(`Failed to find test memberships: ${membershipLookupError.message}`);
      const membershipIds = (memberships ?? []).map((row) => row.id);
      if (membershipIds.length > 0) {
        const roleDelete = await admin.from('membership_roles').delete().in('membership_id', membershipIds);
        if (roleDelete.error) throw new Error(`Failed to clean test role assignments: ${roleDelete.error.message}`);
      }
      const membershipDelete = await admin.from('memberships').delete().eq('organization_id', orgId);
      if (membershipDelete.error) throw new Error(`Failed to clean test memberships: ${membershipDelete.error.message}`);
      const orgDelete = await admin.from('organizations').delete().eq('id', orgId);
      if (orgDelete.error) throw new Error(`Failed to clean test organization: ${orgDelete.error.message}`);
    }
    for (const userId of state.users) {
      const actorDelete = await admin.from('actors').delete().eq('auth_user_id', userId);
      if (actorDelete.error) throw new Error(`Failed to clean test actor: ${actorDelete.error.message}`);
    }
    for (const actorId of state.actorIds) {
      const actorDelete = await admin.from('actors').delete().eq('id', actorId);
      if (actorDelete.error) throw new Error(`Failed to clean test actor: ${actorDelete.error.message}`);
    }
    for (const userId of state.users) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && error.code !== 'user_not_found') throw new Error(`Failed to clean test user: ${error.message}`);
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
      name: state.orgNames[0],
      intent: 'OWNER',
    });
    assert.equal(ownerSetup.organization.onboarding_state, 'ACTIVE');
    orgOwner = ownerSetup.organization.id;
    state.orgs.push(orgOwner);

    const delegatedSetup = await createOrganization(operator, {
      name: state.orgNames[1],
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
      .select('id,actor_id,status,roles!memberships_role_id_fkey(key)')
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
      .select('id,actor_id,status,roles!memberships_role_id_fkey(key)')
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
      .select('actor_id,roles!memberships_role_id_fkey(key)')
      .eq('organization_id', orgDelegated)
      .eq('status', 'ACTIVE');
    assert.ifError(ownerError);
    assert.ok(owners.some((row) => row.roles.key === 'OWNER'));
  });

  test('ownership transfer uses the verified server API and preserves multiple owners', async () => {
    const { accessToken: ownerToken, client: ownerClient } = await signIn(owner);
    const member = await createUser('member');
    const { client: memberClient } = await signIn(member);

    const { data: memberActor, error: actorError } = await admin
      .from('actors')
      .insert({ auth_user_id: member.id, actor_type: 'HUMAN', email: member.email, status: 'ACTIVE' })
      .select('id')
      .single();
    assert.ifError(actorError);
    state.actorIds.push(memberActor.id);

    const { data: operatorRole, error: roleError } = await admin
      .from('roles').select('id').eq('key', 'OPERATOR').single();
    assert.ifError(roleError);

    const { data: membership, error: membershipError } = await admin
      .from('memberships')
      .insert({ organization_id: orgOwner, actor_id: memberActor.id, role_id: operatorRole.id, status: 'ACTIVE' })
      .select('id').single();
    assert.ifError(membershipError);
    state.membershipIds.push(membership.id);

    // The legacy privileged RPC must remain unavailable to authenticated clients.
    const { error: directRpcError } = await ownerClient.rpc('transfer_organization_ownership', {
      p_organization_id: orgOwner,
      p_target_membership_id: membership.id,
      p_demote_current_owner: false,
    });
    assert.ok(directRpcError, 'authenticated clients must not execute the privileged legacy RPC');
    assert.match(directRpcError.message, /permission denied|not authorized/i);

    const { response, payload } = await postOnboarding(
      'ownership/transfer', ownerToken,
      { targetMembershipId: membership.id, demoteCurrentOwner: false },
      { 'x-organization-id': orgOwner },
    );
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.target_membership_id, membership.id);

    const { data: roles, error: rolesError } = await admin
      .from('membership_roles')
      .select('membership_id,roles!membership_roles_role_id_fkey(key)')
      .eq('membership_id', membership.id);
    assert.ifError(rolesError);
    assert.ok(roles.some((row) => row.roles.key === 'OWNER'));

    const { data: owners, error: ownersError } = await admin
      .from('membership_roles')
      .select('membership_id,memberships!inner(organization_id,status),roles!membership_roles_role_id_fkey!inner(key)')
      .eq('memberships.organization_id', orgOwner)
      .eq('memberships.status', 'ACTIVE')
      .eq('roles.key', 'OWNER');
    assert.ifError(ownersError);
    assert.ok(owners.length >= 2);

    // Changing the member's primary role must not erase the separate OWNER assignment.
    const { error: demoteError } = await memberClient
      .from('memberships').update({ role_id: operatorRole.id }).eq('id', membership.id);
    assert.ifError(demoteError);

    const { data: ownerAssignments, error: ownerAssignmentsError } = await admin
      .from('membership_roles')
      .select('role_id,roles!membership_roles_role_id_fkey(key)')
      .eq('membership_id', membership.id);
    assert.ifError(ownerAssignmentsError);
    assert.ok(ownerAssignments.some((row) => row.roles.key === 'OWNER'));

    const { response: demoteResponse, payload: demotePayload } = await postOnboarding(
      'ownership/transfer', ownerToken,
      { targetMembershipId: membership.id, demoteCurrentOwner: true },
      { 'x-organization-id': orgOwner },
    );
    assert.equal(demoteResponse.status, 200, JSON.stringify(demotePayload));

    const { data: remainingOwners, error: remainingOwnersError } = await admin
      .from('membership_roles')
      .select('membership_id,memberships!inner(organization_id,status),roles!membership_roles_role_id_fkey!inner(key)')
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
      .select('membership_id,memberships!inner(organization_id,status),roles!membership_roles_role_id_fkey!inner(key)')
      .eq('memberships.organization_id', orgDelegated)
      .eq('memberships.status', 'ACTIVE')
      .eq('roles.key', 'OWNER');
    assert.ifError(error);
    assert.equal(owners.length, 1);

    const { client: ownerClient, accessToken } = await signIn(secondOwner);
    const { error: directError } = await ownerClient.rpc('transfer_organization_ownership', {
      p_organization_id: orgDelegated,
      p_target_membership_id: owners[0].membership_id,
      p_demote_current_owner: true,
    });
    assert.ok(directError, 'the legacy privileged RPC remains unavailable to authenticated clients');

    const { response, payload } = await postOnboarding(
      'ownership/transfer', accessToken,
      { targetMembershipId: owners[0].membership_id, demoteCurrentOwner: true },
      { 'x-organization-id': orgDelegated },
    );
    assert.equal(response.status, 409, JSON.stringify(payload));
    assert.equal(payload.code, 'FINAL_OWNER_CANNOT_BE_DEMOTED');
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
