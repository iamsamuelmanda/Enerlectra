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
 * This is a contract, not proof of authorization. A resolver must derive it
 * from authenticated identity + active membership and never trust a
 * client/channel-supplied organization_id as authorization evidence.
 */
export interface TenantContextResolver {
  resolve(input: {
    actorId: string;
    organizationId?: string;
    correlationId: string;
    requestId: string;
    source: TenantSource;
  }): Promise<TenantContext>;
}
