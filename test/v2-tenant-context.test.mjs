import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantContextResolver, TenantContextError } from '../server/src/platform/tenant/resolver.ts';

function chain(data, error = null) {
  const value = {
    data,
    error,
    select() { return this; },
    eq() { return this; },
    maybeSingle() { return Promise.resolve({ data, error }); },
    then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); },
  };
  return value;
}

function makeClient({ user, actor, memberships, permissions, profile = null, businessModels = [], capabilities = [], policies = [] }) {
  return {
    auth: {
      async getUser(token) {
        if (token !== 'valid-token') return { data: { user: null }, error: new Error('invalid') };
        return { data: { user }, error: null };
      },
    },
    from(table) {
      if (table === 'actors') return chain(actor);
      if (table === 'memberships') return chain(memberships);
      if (table === 'role_permissions') {
        return chain(permissions.map((key) => ({ permissions: { key } })));
      }
      if (table === 'operating_model_profiles') {
        return chain(profile);
      }
      if (table === 'operating_model_business_models') {
        return chain(businessModels);
      }
      if (table === 'organization_capabilities') {
        return chain(capabilities);
      }
      if (table === 'organization_policies') {
        return chain(policies);
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const baseUser = { id: 'auth-user-1' };
const baseActor = { id: 'actor-1', auth_user_id: 'auth-user-1', status: 'ACTIVE' };
const baseMembership = {
  id: 'membership-1',
  organization_id: 'org-1',
  role_id: 'role-operator',
  status: 'ACTIVE',
  organizations: { id: 'org-1', status: 'ACTIVE' },
  roles: { key: 'OPERATOR' },
};

test('resolves authenticated user to verified tenant context', async () => {
  const resolver = createTenantContextResolver(
    makeClient({
      user: baseUser,
      actor: baseActor,
      memberships: [baseMembership],
      permissions: ['organization.read', 'customer.read'],
    })
  );

  await assert.doesNotReject(async () => {
    const context = await resolver.resolve({
      accessToken: 'valid-token',
      organizationId: 'org-1',
      correlationId: 'corr-1',
      requestId: 'req-1',
      source: 'web',
    });

    assert.deepEqual(context, {
      actorId: 'actor-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roles: ['OPERATOR'],
      permissions: ['organization.read', 'customer.read'],
      operatingContext: {
        profileId: null,
        profileName: null,
        profileConfiguration: {},
        businessModels: [],
        capabilities: [],
        capabilityConfiguration: {},
        policies: {},
      },
      correlationId: 'corr-1',
      requestId: 'req-1',
      source: 'web',
    });
  });
});

test('rejects an unverified organization claim', async () => {
  const resolver = createTenantContextResolver(
    makeClient({ user: baseUser, actor: baseActor, memberships: [], permissions: [] })
  );

  await assert.rejects(
    () => resolver.resolve({
      accessToken: 'valid-token',
      organizationId: 'org-attacker',
      correlationId: 'corr-1',
      requestId: 'req-1',
      source: 'whatsapp',
    }),
    (error) => error instanceof TenantContextError && error.code === 'MEMBERSHIP_NOT_FOUND'
  );
});

test('rejects inactive actors', async () => {
  const resolver = createTenantContextResolver(
    makeClient({
      user: baseUser,
      actor: { ...baseActor, status: 'SUSPENDED' },
      memberships: [baseMembership],
      permissions: [],
    })
  );

  await assert.rejects(
    () => resolver.resolve({
      accessToken: 'valid-token',
      correlationId: 'corr-1',
      requestId: 'req-1',
      source: 'api',
    }),
    (error) => error instanceof TenantContextError && error.code === 'ACTOR_INACTIVE'
  );
});

test('rejects ambiguous organization context', async () => {
  const secondMembership = {
    ...baseMembership,
    id: 'membership-2',
    organization_id: 'org-2',
    organizations: { id: 'org-2', status: 'ACTIVE' },
  };
  const resolver = createTenantContextResolver(
    makeClient({
      user: baseUser,
      actor: baseActor,
      memberships: [baseMembership, secondMembership],
      permissions: [],
    })
  );

  await assert.rejects(
    () => resolver.resolve({
      accessToken: 'valid-token',
      correlationId: 'corr-1',
      requestId: 'req-1',
      source: 'api',
    }),
    (error) => error instanceof TenantContextError && error.code === 'AMBIGUOUS_ORGANIZATION'
  );
});


test('resolves mixed operating context without changing the authorization model', async () => {
  const resolver = createTenantContextResolver(
    makeClient({
      user: baseUser,
      actor: baseActor,
      memberships: [baseMembership],
      permissions: ['organization.read', 'situation.manage'],
      profile: {
        id: 'profile-1',
        name: 'Mixed energy operator',
        configuration: {
          business_activities: ['INSTALLATION', 'MAINTENANCE', 'ENERGY_SERVICE'],
          customer_segments: ['SME', 'COMMERCIAL'],
        },
      },
      businessModels: [
        { business_model_key: 'EPC', is_primary: true },
        { business_model_key: 'ENERGY_AS_A_SERVICE', is_primary: false },
      ],
      capabilities: [
        { capability_key: 'INSTALLATION', status: 'ENABLED', configuration: {} },
        { capability_key: 'FIELD_SERVICE', status: 'ENABLED', configuration: { dispatch_window_hours: 24 } },
        { capability_key: 'PAYMENT_RECONCILIATION', status: 'DISABLED', configuration: {} },
      ],
      policies: [
        { policy_key: 'fault_escalation_hours', value: 24 },
      ],
    }),
  );

  const context = await resolver.resolve({
    accessToken: 'valid-token',
    organizationId: 'org-1',
    correlationId: 'corr-mixed',
    requestId: 'req-mixed',
    source: 'api',
  });

  assert.deepEqual(context.operatingContext.businessModels, ['EPC', 'ENERGY_AS_A_SERVICE']);
  assert.deepEqual(context.operatingContext.capabilities, ['INSTALLATION', 'FIELD_SERVICE']);
  assert.deepEqual(context.operatingContext.capabilityConfiguration.FIELD_SERVICE, { dispatch_window_hours: 24 });
  assert.deepEqual(context.operatingContext.policies, { fault_escalation_hours: 24 });
});
