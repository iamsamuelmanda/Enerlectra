import { createClient } from '@supabase/supabase-js';

const V2_SUPABASE_URL = import.meta.env.VITE_V2_SUPABASE_URL as string | undefined;
const V2_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_V2_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!V2_SUPABASE_URL || !V2_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing V2 browser Supabase configuration: VITE_V2_SUPABASE_URL and VITE_V2_SUPABASE_PUBLISHABLE_KEY'
  );
}

/**
 * Transitional V2 browser client.
 *
 * This file is intentionally separate from the active V1 client until the
 * application cutover. It uses only a publishable key and can never receive
 * a service-role credential.
 */
export const supabaseV2 = createClient(
  V2_SUPABASE_URL,
  V2_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
