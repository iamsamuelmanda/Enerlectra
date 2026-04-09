import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('❌ SUPABASE_URL is missing. Check your .env file.');
}
if (!supabaseServiceKey) {
  throw new Error('❌ SUPABASE_SERVICE_ROLE_KEY is missing. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
