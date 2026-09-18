import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readV2ServerConfig } from '../config/v2.js';

/**
 * Server-only V2 Supabase client.
 *
 * The service-role key bypasses RLS and must never cross into browser code.
 * Domain services should still establish and validate tenant context before
 * accessing organization-scoped data.
 */
export function createV2AdminClient(): SupabaseClient {
  const config = readV2ServerConfig();

  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
