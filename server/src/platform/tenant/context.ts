export type TenantSource = 'web' | 'whatsapp' | 'telegram' | 'api' | 'system';

export interface TenantContext {
  actorId: string;
  organizationId: string;
  membershipId: string;
  roles: readonly string[];
  permissions: readonly string[];
  correlationId: string;
  requestId: string;
  source: TenantSource;
}

/**
 * TenantContext is the minimum authorization context required by V2
 * organization-scoped operations.
 *
 * This is a contract, not proof of authorization. The resolver derives it
 * from a verified Supabase access token + active membership and never treats
 * a client/channel-supplied organization_id as authorization evidence.
 */
export interface TenantContextResolver {
  resolve(input: {
    accessToken: string;
    organizationId?: string;
    correlationId: string;
    requestId: string;
    source: TenantSource;
  }): Promise<TenantContext>;
}
