// enerlectra-core/src/core/handlers/start.handler.ts
import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { supabase } from '../../../../infrastructure/supabase.js';
import { logger } from '../../../services/logger.js';
import { getPhoneNumber } from '../../../services/resolve-user.js';
import { getUserRole } from '../../../services/identity.js';

export interface StartCommandPayload {
  startPayload?: string; // base64 string from Telegram deep link
  telegram: {
    id: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
}

export type StartOutcome =
  | 'JOINED_CLUSTER_FROM_PAYLOAD'
  | 'ROLE_SELECTION_REQUIRED'
  | 'ROLE_HOME'
  | 'ROLE_HOME_NO_PHONE'
  | 'CLUSTER_JOIN_FAILED';

export interface StartResult {
  outcome: StartOutcome;
  message?: string;
  userId: string;
  clusterId?: string;
  role?: string | null;
  hasPhone?: boolean;
}

/**
 * START_SESSION
 *
 * Previously: handleStart(ctx: BotContext)
 */
export class StartSessionHandler implements CommandHandler {
  async execute(command: Command): Promise<StartResult> {
    const payload = command.payload as StartCommandPayload | any;

    // 1. Use pre-resolved actorId from ExecutionContext (WhatsApp-compatible)
    const userId = command.context.actorId;

    // 2. Try deep-link start payload first (cluster join)
    const startPayload = payload.startPayload;
    if (startPayload) {
      const clusterResult = await this.handleStartPayloadClusterJoin(
        userId,
        startPayload,
      );
      if (clusterResult) {
        return { userId, ...clusterResult };
      }
      // malformed payload: fall through to role logic
    }

    // 3. Role-based home or selection
    const role = await getUserRole(userId);
    if (!role) {
      // No role yet – send role selection UX
      return { outcome: 'ROLE_SELECTION_REQUIRED', userId, role: null };
    }

    // 4. Role home + phone tip if missing
    const phone = await getPhoneNumber(userId);
    const hasPhone = !!phone;
    if (!hasPhone) {
      return {
        outcome: 'ROLE_HOME_NO_PHONE',
        userId,
        role,
        hasPhone,
        message:
          'Tip: Register your mobile number with /register for payment and token lookups.',
      };
    }

    return { outcome: 'ROLE_HOME', userId, role, hasPhone };
  }

  /**
   * Handles the deep-link startPayload cluster join.
   * Returns StartResult fields when a clusterId is present and we should short-circuit,
   * or null if no valid clusterId was found or payload was malformed.
   */
  private async handleStartPayloadClusterJoin(
    userId: string,
    startPayload: string,
  ): Promise<Omit<StartResult, 'userId'> | null> {
    try {
      const decoded = Buffer.from(startPayload, 'base64').toString('utf-8');
      const clusterId = decoded
        .split('|')
        .find((part) => part.startsWith('c:'))
        ?.replace('c:', '');

      if (!clusterId) {
        return null;
      }

      const { error: joinError } = await supabase
        .from('cluster_members')
        .upsert(
          { cluster_id: clusterId, user_id: userId },
          { onConflict: 'cluster_id,user_id' },
        );

      if (joinError) {
        logger.error(
          { joinError, userId, clusterId },
          'Start payload cluster join failed',
        );
        return {
          outcome: 'CLUSTER_JOIN_FAILED',
          clusterId,
          message:
            'Welcome! We had trouble linking your community. Use /clusters to join manually.',
        };
      }

      // Cluster join succeeded – mirror original welcome copy
      const message =
        `*Welcome to Enerlectra*\n\n` +
        `Community: \`${clusterId}\`\n\n` +
        `Send a meter photo to log a reading.`;

      return { outcome: 'JOINED_CLUSTER_FROM_PAYLOAD', clusterId, message };
    } catch {
      // Ignore malformed start payloads and fall back to role logic
      return null;
    }
  }
}