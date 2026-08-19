import { supabase } from '../../infrastructure/supabase.js';

export async function getUserRole(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('telegram_users')
    .select('role')
    .eq('user_id', userId)
    .single();
  return data?.role ?? null;
}

export async function getUserOrgId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('telegram_users')
    .select('organization_id')
    .eq('user_id', userId)
    .single();
  return data?.organization_id ?? null;
}

export async function setUserRole(userId: string, role: string) {
  await supabase
    .from('telegram_users')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

