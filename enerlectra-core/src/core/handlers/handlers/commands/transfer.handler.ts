// enerlectra-core/src/core/handlers/transfer.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';
import { transferPCU } from '../../../services/pcuTransfer.js';
import { logger } from '../../../services/logger.js';

export interface TransferCommandPayload {
  rawText: string; // e.g. "/transfer 10 @alice"
}

export interface TransferResult {
  success: boolean;
  message: string;
  amountPcu?: number;
  toUsername?: string;
}

/**
 * TRANSFER_PCU
 *
 * Previously: handleTransfer(ctx: BotContext)
 */
export class TransferPCUHandler implements CommandHandler {
  async execute(command: Command): Promise<TransferResult> {
    const payload = command.payload as TransferCommandPayload | any;
    const rawText = String(payload.rawText ?? '');

    if (!rawText) {
      return {
        success: false,
        message: 'Usage: /transfer <amount> <@username>',
      };
    }

    const parts = rawText.trim().split(/\s+/);
    // parts[0] is "/transfer"
    const amount = parseFloat(parts[1]);
    const targetUsername = parts[2]?.replace('@', '');

    if (!amount || amount <= 0 || !targetUsername) {
      return {
        success: false,
        message: 'Usage: /transfer <amount> <@username>',
      };
    }

    const { actorId: userId } = command.context;

    const result = await transferPCU({
      fromUserId: userId,
      toUsername: targetUsername,
      amountPcu: amount,
      logger,
    });

    if (!result.success) {
      return {
        success: false,
        message: result.errorMessage || 'Transfer failed.',
        amountPcu: amount,
        toUsername: targetUsername,
      };
    }

    return {
      success: true,
      message: `Transferred ${amount} PCU to @${targetUsername}`,
      amountPcu: amount,
      toUsername: targetUsername,
    };
  }
}