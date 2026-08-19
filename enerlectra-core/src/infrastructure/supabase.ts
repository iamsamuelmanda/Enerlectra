// enerlectra-core/src/infrastructure/supabase.ts
// Single source of truth for the Supabase client used by core services.
// Re-exports the existing monorepo-root-aware client from src/lib/supabase.ts
// so core services no longer need to reach into integrations/telegram-bot.
export { supabase } from '../lib/supabase.js';
