import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function canonicalSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY are required for an authenticated request-scoped client',
    );
  }
  return { url, anonKey };
}

/**
 * Build the request-scoped Supabase client used only when a downstream operation
 * needs PostgreSQL RLS to evaluate the caller's bearer token.
 *
 * The service-role client remains the composition-root authority for server-side
 * orchestration; this client never accepts tenant identity from the request.
 */
export function createRequestScopedSupabaseClient(accessToken: string): SupabaseClient {
  if (!accessToken.trim()) throw new Error('AUTHENTICATED_REQUEST_REQUIRED');
  const { url, anonKey } = canonicalSupabaseConfig();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
