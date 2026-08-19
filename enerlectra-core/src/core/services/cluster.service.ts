import { supabase } from '../../infrastructure/supabase.js';
import { logger } from './logger.js';

export interface Cluster {
  id: string;
  name: string;
  location: string | null;
}

export async function getUserClusters(userId: string): Promise<Cluster[]> {
  const { data: clusters, error } = await supabase
    .from('clusters')
    .select('id, name, location')
    .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
    .limit(10);

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch clusters');
    throw error;
  }

  return clusters || [];
}