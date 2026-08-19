// enerlectra-core/src/core/handlers/privacy.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';

export interface PrivacyResult {
  message: string;
}

/**
 * SHOW_PRIVACY
 *
 * Previously: handlePrivacy(ctx: BotContext)
 */
export class ShowPrivacyHandler implements CommandHandler {
  async execute(_command: Command): Promise<PrivacyResult> {
    const message =
      `*Enerlectra Privacy Policy*\n\n` +
      `Data collected: Telegram ID, username, phone number, meter readings, location.\n\n` +
      `Why: To process energy settlements and deliver payouts.\n\n` +
      `Storage: Encrypted via Supabase. Never sold to third parties.\n\n` +
      `Contact: enerlectra.energy@gmail.com`;

    return { message };
  }
}