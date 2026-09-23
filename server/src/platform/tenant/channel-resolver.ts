import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext, TenantSource } from './context.js';

export class ChannelTenantResolutionError extends Error {
  constructor(
    public readonly code:
      | 'CHANNEL_IDENTITY_NOT_FOUND'
      | 'CHANNEL_IDENTITY_DISABLED'
      | 'ACTOR_NOT_FOUND'
      | 'ACTOR_INACTIVE'
      | 'MEMBERSHIP_NOT_FOUND'
      | 'AMBIGUOUS_ORGANIZATION'
      | 'ORGANIZATION_INACTIVE'
      | 'ROLE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'ChannelTenantResolutionError';
  }
}

/**
 * Resolve an inbound channel identity into canonical V2 tenancy.
 *
 * The external channel identifier is only a lookup key. It never grants
 * authorization and it never supplies organization or role information.
 */
export async function resolveChannelTenantContext(
  client: SupabaseClient,
  input: {
    channel: Extract<TenantSource, 'whatsapp' | 'telegram'>;
    externalId: string;
    correlationId: string;
    requestId: string;
  },
): Promise<TenantContext> {
  const identity = await client
    .from('channel_identities')
    .select('id, actor_id, status')
    .eq('channel', input.channel)
    .eq('external_id', input.externalId)
    .maybeSingle();

  if (identity.error) {
    throw new Error(`Channel identity lookup failed: ${identity.error.message}`);
  }
  if (!identity.data) {
    throw new ChannelTenantResolutionError(
      'CHANNEL_IDENTITY_NOT_FOUND',
      'Channel identity is not linked to an Enerlectra actor',
    );
  }
  if (identity.data.status !== 'ACTIVE') {
    throw new ChannelTenantResolutionError(
      'CHANNEL_IDENTITY_DISABLED',
      'Channel identity is disabled',
    );
  }

  const actor = await client
    .from('actors')
    .select('id, status')
    .eq('id', identity.data.actor_id)
    .maybeSingle();

  if (actor.error) {
    throw new Error(`Actor lookup failed: ${actor.error.message}`);
  }
  if (!actor.data) {
    throw new ChannelTenantResolutionError('ACTOR_NOT_FOUND', 'Channel actor does not exist');
  }
  if (actor.data.status !== 'ACTIVE') {
    throw new ChannelTenantResolutionError('ACTOR_INACTIVE', 'Channel actor is not active');
  }

  const memberships = await client
    .from('memberships')
    .select('id, organization_id, role_id, status, organizations!inner(id,status), roles!inner(key)')
    .eq('actor_id', actor.data.id)
    .eq('status', 'ACTIVE');

  if (memberships.error) {
    throw new Error(`Channel membership lookup failed: ${memberships.error.message}`);
  }
  if (!memberships.data?.length) {
    throw new ChannelTenantResolutionError(
      'MEMBERSHIP_NOT_FOUND',
      'Channel actor has no active organization membership',
    );
  }
  if (memberships.data.length !== 1) {
    throw new ChannelTenantResolutionError(
      'AMBIGUOUS_ORGANIZATION',
      'Channel actor has multiple active memberships; channel organization selection is not authorized',
    );
  }

  const membership = memberships.data[0] as any;
  if (!membership.organizations || membership.organizations.status !== 'ACTIVE') {
    throw new ChannelTenantResolutionError(
      'ORGANIZATION_INACTIVE',
      'Channel organization is not active',
    );
  }
  if (!membership.roles) {
    throw new ChannelTenantResolutionError('ROLE_NOT_FOUND', 'Membership role could not be resolved');
  }

  const permissions = await client
    .from('role_permissions')
    .select('permissions!inner(key)')
    .eq('role_id', membership.role_id);

  if (permissions.error) {
    throw new Error(`Channel permission lookup failed: ${permissions.error.message}`);
  }

  return {
    actorId: actor.data.id,
    organizationId: membership.organization_id,
    membershipId: membership.id,
    roles: [membership.roles.key],
    permissions: [...new Set((permissions.data ?? [])
      .map((row: any) => row.permissions?.key)
      .filter(Boolean))],
    correlationId: input.correlationId,
    requestId: input.requestId,
    source: input.channel,
  };
}
