// enerlectra-core/src/core/handlers/clusters.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';

export interface ClusterSummary {
  id: string;
  name: string;
  location?: string | null;
}

export interface ClustersResult {
  clusters: ClusterSummary[];
  message: string;
}

/**
 * SHOW_CLUSTERS
 *
 * Previously: handleClusters(ctx: BotContext)
 */
export class ShowClustersHandler implements CommandHandler {
  async execute(_command: Command): Promise<ClustersResult> {
    const { data: clusters, error } = await supabase
      .from('clusters')
      .select('id, name, location')
      .in('lifecycle_state', ['FUNDING', 'OPERATIONAL', 'FUNDED'])
      .limit(10);

    if (error) {
      logger.error({ error }, 'Failed to fetch clusters');
      return {
        clusters: [],
        message: 'Unable to load communities. Please try again.',
      };
    }

    if (!clusters?.length) {
      return {
        clusters: [],
        message: 'No communities available. Contact your administrator.',
      };
    }

    const summaries: ClusterSummary[] = clusters.map((cluster: any) => ({
      id: String(cluster.id),
      name: String(cluster.name),
      location: cluster.location ?? null,
    }));

    const message = `*Energy Communities*\n\nSelect one to join:`;

    return {
      clusters: summaries,
      message,
    };
  }
}