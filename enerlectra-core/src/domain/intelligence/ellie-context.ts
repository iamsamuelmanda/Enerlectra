export interface EllieEvidence {
  id: string;
  type: string;
  summary?: string;
  occurredAt?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface EllieSituation {
  id: string;
  status: string;
  title?: string;
  severity?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface EllieRecommendation {
  id: string;
  situationId?: string;
  summary?: string;
  rationale?: string;
  metadata?: Record<string, unknown>;
}

export interface EllieMemory {
  id: string;
  memoryType: string;
  scopeKey: string;
  statement: string;
  evidenceRefs: unknown[];
  confidence: number;
  occurrenceCount: number;
  lastConfirmedAt?: string;
}

export interface EllieWorkItem {
  id: string;
  situationId?: string;
  status: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface EllieOrganizationSnapshot {
  customerCount: number;
  siteCount: number;
  assetCount: number;
  openSituationCount: number;
  openWorkItemCount: number;
  activeActionCount: number;
}

export interface EllieContext {
  actorId: string;
  organizationId: string;
  permissions: string[];
  operatingContext: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  policies: Record<string, unknown>;
  evidence: EllieEvidence[];
  situations: EllieSituation[];
  recommendations: EllieRecommendation[];
  work: EllieWorkItem[];
  memories: EllieMemory[];
  organizationSnapshot?: EllieOrganizationSnapshot;
  source: 'canonical';
}
