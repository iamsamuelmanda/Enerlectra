// lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseServerClient(jwt?: string) {
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!, // Use ANON key – we verify JWT manually
    {
      global: {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return client;
}