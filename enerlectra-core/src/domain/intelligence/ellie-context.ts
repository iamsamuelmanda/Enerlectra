export type EllieKnowledgeType =
  | 'FACT'
  | 'PROCEDURE'
  | 'POLICY'
  | 'PATTERN'
  | 'PREFERENCE'
  | 'OUTCOME';

export interface EllieEvidence {
  id: string;
  type: string;
  summary?: string;
  occurredAt?: string;
  resourceId?: string;
  evidenceStrength?: number;
  provenance?: Record<string, unknown>;
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
  knowledgeType: EllieKnowledgeType;
  scopeKey: string;
  statement: string;
  evidenceRefs: unknown[];
  resourceRefs: unknown[];
  confidence: number;
  evidenceStrength: number;
  occurrenceCount: number;
  contradictionCount: number;
  lastConfirmedAt?: string;
  validFrom?: string;
  validUntil?: string;
  status?: string;
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
  unresolvedHighSeverityCount?: number;
  overdueWorkItemCount?: number;
  unassignedWorkItemCount?: number;
  oldestOpenSituationAt?: string | null;
}

export interface EllieOperationalDigest {
  customers?: Array<Record<string, unknown>>;
  sites?: Array<Record<string, unknown>>;
  assets?: Array<Record<string, unknown>>;
  recentEvidence?: EllieEvidence[];
  activeExceptions?: EllieSituation[];
  operationalHistory?: EllieEvidence[];
  availableResourceTypes: string[];
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
  operationalDigest?: EllieOperationalDigest;
  source: 'canonical';
}
