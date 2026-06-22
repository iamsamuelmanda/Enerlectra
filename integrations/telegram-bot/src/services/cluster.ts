import { supabase } from '../lib/supabase';
import { redis } from '../lib/redis';
import { logger } from './logger';

export async function resolveCluster(ctx: any, userId: string) {
  if (ctx.session?.clusterId) return { clusterId: ctx.session.clusterId, unitId: null };

  const cached = await redis.get(`selected_cluster:${userId}`);
  if (cached) {
    ctx.session.clusterId = cached;
    return { clusterId: cached as string, unitId: null };
  }

  const { data, error } = await supabase
    .from('cluster_members')
    .select('cluster_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) logger.warn({ error, userId }, 'Failed to resolve cluster');

  if (data?.cluster_id) {
    ctx.session.clusterId = data.cluster_id;
    return { clusterId: data.cluster_id, unitId: null };
  }

  return { clusterId: null, unitId: null };
}

export async function getPhoneNumber(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('telegram_users')
    .select('phone_number')
    .eq('user_id', userId)
    .single();
  return data?.phone_number ?? null;
}

