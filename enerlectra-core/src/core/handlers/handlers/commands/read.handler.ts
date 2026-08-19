// enerlectra-core/src/core/handlers/read.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { resolveUserId } from '../../../services/resolve-user.js';
import { processManualReading } from '../../../services/manual-reading.js';
import { logger } from '../../../services/logger.js';

export interface ReadCommandPayload {
  rawText: string; // e.g. "/read 152.61 solar_export"
}

export interface ReadResult {
  message: string;
}

/**
 * SUBMIT_MANUAL_READING
 *
 * Handles manual meter reading submission via command pattern
 */
export class SubmitManualReadingHandler implements CommandHandler {
  async execute(command: Command): Promise<ReadResult> {
    const payload = command.payload as ReadCommandPayload | any;
    const rawText = String(payload.rawText ?? '');

    // No usable text – mirror old behaviour (no-op or usage hint)
    if (!rawText) {
      return {
        message:
          'Usage: /read <kWh> [type]  e.g. /read 152.61 solar_export',
      };
    }

    // Parse args from text: "/read <kWh> [type]"
    const parts = rawText.trim().split(/\s+/);
    // parts[0] is "/read"
    const kwh = parseFloat(parts[1]);
    const meterType = (parts[2] as any) || 'unknown';

    if (isNaN(kwh) || kwh <= 0) {
      return {
        message:
          'Usage: /read <kWh> [type]  e.g. /read 152.61 solar_export',
      };
    }

    const userId = command.context.actorId;

    try {
      const resultMsg = await processManualReading(userId, kwh, meterType);
      // Telegram will render this as Markdown; other channels can render as plain or rich text.
      return { message: resultMsg };
    } catch (err) {
      logger.error({ err, userId }, 'Manual reading failed');
      return {
        message:
          'An error occurred while saving your reading. Please try again.',
      };
    }
  }
}
