// Shared legacy-capability database adapter.
//
// Canonical application routes use the tenant-aware Supabase boundary. This module
// exists only for isolated historical/future capability adapters that still need a
// service-role database client; it must use the same canonical environment names.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the isolated capability database adapter.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
