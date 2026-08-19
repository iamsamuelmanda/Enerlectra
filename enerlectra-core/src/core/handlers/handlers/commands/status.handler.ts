// enerlectra-core/src/core/handlers/status.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';

export interface StatusResult {
  hasCluster: boolean;
  clusterId?: string;
  phone?: string | null;
  message: string;
}

/**
 * SHOW_STATUS
 *
 * Previously: handleStatus(ctx: BotContext)
 */
export class ShowStatusHandler implements CommandHandler {
  async execute(command: Command): Promise<StatusResult> {
    const userId = command.context.actorId;
    const sessionClusterId = command.context.session?.clusterId as string | undefined;

    // 1. Phone lookup
    const { data: phoneData, error: phoneError } = await supabase
      .from('telegram_users')
      .select('phone_number')
      .eq('user_id', userId)
      .single();

    if (phoneError) {
      logger.error({ phoneError, userId }, 'Failed to load phone number for status');
    }

    const phone = phoneData?.phone_number ?? null;

    // 2. Cluster lookup
    const { data: clusterData, error: clusterError } = await supabase
      .from('cluster_members')
      .select('cluster_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (clusterError) {
      logger.error({ clusterError, userId }, 'Failed to load cluster membership for status');
    }

    const clusterId = clusterData?.cluster_id || sessionClusterId;

    if (!clusterId) {
      // Mirrors: "Not part of a community. Use /clusters to join one."
      return {
        hasCluster: false,
        message: 'Not part of a community. Use /clusters to join one.',
      };
    }

    const message =
      `*Status*\n\n` +
      `Community\n\`${clusterId}\`\n\n` +
      `Mobile\n${phone ?? 'Not registered - /register'}\n\n` +
      `Send a meter photo to log your next reading.`;

    return {
      hasCluster: true,
      clusterId,
      phone,
      message,
    };
  }
}