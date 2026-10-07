import { SupabaseClient } from '@supabase/supabase-js';
import type { EllieContext } from '../../domain/intelligence/ellie-context.js';

export interface ExecutionContext {
  actorId: string;
  organizationId: string;
  correlationId: string;
  supabase: SupabaseClient;
  logger: any;
  posthog: any;
  transaction?: any;
  featureFlags?: Record<string, boolean>;
  /** Canonical intelligence context resolved from the V2 tenant boundary. */
  ellieContext?: EllieContext;
  /** Legacy/free-form AI context retained for backwards compatibility. */
  aiContext?: Record<string, any>;
}

export type WorkflowContext = ExecutionContext;
