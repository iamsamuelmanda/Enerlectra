// enerlectra-core/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root (2 levels up)
const rootEnvPath = resolve(__dirname, '../../../.env');
const serverEnvPath = resolve(__dirname, '../../server/.env');

config({ path: rootEnvPath });
config({ path: serverEnvPath, override: true });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ENV paths checked:', rootEnvPath, serverEnvPath);
  console.error('Available:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  throw new Error(
    `SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env (checked: ${rootEnvPath})`
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);