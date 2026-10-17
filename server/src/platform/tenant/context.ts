export type TenantSource = 'web' | 'whatsapp' | 'telegram' | 'api' | 'system';

export type OrganizationOperatingContext = {
  profileId: string | null;
  profileName: string | null;
  profileConfiguration: Record<string, unknown>;
  businessModels: readonly string[];
  capabilities: readonly string[];
  capabilityConfiguration: Readonly<Record<string, Record<string, unknown>>>;
  policies: Readonly<Record<string, unknown>>;
};

export interface TenantContext {
  actorId: string;
  organizationId: string;
  membershipId: string;
  roles: readonly string[];
  permissions: readonly string[];
  operatingContext: OrganizationOperatingContext;
  correlationId: string;
  requestId: string;
  source: TenantSource;
}

export interface TenantContextResolver {
  resolve(input: {
    accessToken: string;
    organizationId?: string;
    correlationId: string;
    requestId: string;
    source: TenantSource;
  }): Promise<TenantContext>;
}
