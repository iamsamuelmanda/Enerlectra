export interface V2ServerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required V2 environment variable: ${key}`);
  }
  return value;
}

/**
 * V2-only server configuration.
 *
 * Deliberately does not read SUPABASE_URL, SUPABASE_SERVICE_KEY,
 * or any other legacy Supabase variable. During reconstruction this
 * boundary prevents accidental V1/V2 database fallback.
 */
export function readV2ServerConfig(env: NodeJS.ProcessEnv = process.env): V2ServerConfig {
  return {
    supabaseUrl: required(env, 'V2_SUPABASE_URL'),
    supabaseServiceRoleKey: required(env, 'V2_SUPABASE_SERVICE_ROLE_KEY'),
  };
}
