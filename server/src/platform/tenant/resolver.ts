import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { TenantContext, TenantContextResolver, TenantSource } from './context.js';

export class TenantContextError extends Error {
  constructor(
    public readonly code:
      | 'UNAUTHENTICATED'
      | 'ACTOR_NOT_FOUND'
      | 'ACTOR_INACTIVE'
      | 'MEMBERSHIP_NOT_FOUND'
      | 'ORGANIZATION_NOT_FOUND'
      | 'ORGANIZATION_INACTIVE'
      | 'AMBIGUOUS_ORGANIZATION'
      | 'ROLE_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'TenantContextError';
  }
}

type ResolverInput = {
  accessToken: string;
  organizationId?: string;
  correlationId: string;
  requestId: string;
  source: TenantSource;
};

type ActorRow = {
  id: string;
  auth_user_id: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
};

type MembershipRow = {
  id: string;
  organization_id: string;
  role_id: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  organizations: { id: string; status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' } | null;
  roles: { key: string } | null;
};

type PermissionRow = {
  permissions: { key: string } | null;
};

export function createTenantContextResolver(client: SupabaseClient): TenantContextResolver {
  return {
    async resolve(input: ResolverInput): Promise<TenantContext> {
      if (!input.accessToken || input.accessToken.trim().length === 0) {
        throw new TenantContextError('UNAUTHENTICATED', 'An access token is required');
      }

      const authResult = await client.auth.getUser(input.accessToken);
      if (authResult.error || !authResult.data.user) {
        throw new TenantContextError('UNAUTHENTICATED', 'Authentication could not be verified');
      }

      const user: User = authResult.data.user;

      const actorResult = await client
        .from('actors')
        .select('id, auth_user_id, status')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (actorResult.error) {
        throw new Error(`Tenant actor lookup failed: ${actorResult.error.message}`);
      }

      const actor = actorResult.data as ActorRow | null;
      if (!actor) {
        throw new TenantContextError('ACTOR_NOT_FOUND', 'Authenticated user has no Enerlectra actor');
      }
      if (actor.status !== 'ACTIVE') {
        throw new TenantContextError('ACTOR_INACTIVE', 'Actor is not active');
      }

      let membershipQuery = client
        .from('memberships')
        .select(
          'id, organization_id, role_id, status, organizations!inner(id, status), roles!inner(key)'
        )
        .eq('actor_id', actor.id)
        .eq('status', 'ACTIVE');

      if (input.organizationId) {
        membershipQuery = membershipQuery.eq('organization_id', input.organizationId);
      }

      const membershipResult = await membershipQuery;
      if (membershipResult.error) {
        throw new Error(`Tenant membership lookup failed: ${membershipResult.error.message}`);
      }

      const memberships = (membershipResult.data ?? []) as MembershipRow[];

      if (memberships.length === 0) {
        throw new TenantContextError(
          'MEMBERSHIP_NOT_FOUND',
          input.organizationId
            ? 'Actor has no active membership in the requested organization'
            : 'Actor has no active organization membership'
        );
      }

      if (memberships.length > 1) {
        throw new TenantContextError(
          'AMBIGUOUS_ORGANIZATION',
          'Actor has multiple active organization memberships; an organization context is required'
        );
      }

      const membership = memberships[0];

      if (!membership.organizations) {
        throw new TenantContextError('ORGANIZATION_NOT_FOUND', 'Membership organization could not be resolved');
      }
      if (membership.organizations.status !== 'ACTIVE') {
        throw new TenantContextError('ORGANIZATION_INACTIVE', 'Organization is not active');
      }
      if (!membership.roles) {
        throw new TenantContextError('ROLE_NOT_FOUND', 'Membership role could not be resolved');
      }

      const permissionResult = await client
        .from('role_permissions')
        .select('permissions!inner(key)')
        .eq('role_id', membership.role_id);

      if (permissionResult.error) {
        throw new Error(`Tenant permission lookup failed: ${permissionResult.error.message}`);
      }

      const permissionRows = (permissionResult.data ?? []) as PermissionRow[];
      const permissions = permissionRows
        .map((row) => row.permissions?.key)
        .filter((key): key is string => Boolean(key));

      return {
        actorId: actor.id,
        organizationId: membership.organization_id,
        membershipId: membership.id,
        roles: [membership.roles.key],
        permissions: [...new Set(permissions)],
        correlationId: input.correlationId,
        requestId: input.requestId,
        source: input.source,
      };
    },
  };
}
