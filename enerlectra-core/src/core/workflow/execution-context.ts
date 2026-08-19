// src/core/workflow/execution-context.ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface ExecutionContext {
  // Identities
  actorId: string;
  organizationId: string;
  correlationId: string;
  
  // Infrastructure
  supabase: SupabaseClient;
  logger: any; // Logger instance
  posthog: any; // Telemetry client
  
  // State / Capabilities
  transaction?: any; // For DB transactions
  featureFlags?: Record<string, boolean>;
  aiContext?: Record<string, any>;
}

// Keep the alias so CommandRouter doesn't break
export type WorkflowContext = ExecutionContext;