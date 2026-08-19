// enerlectra-core/src/core/handlers/help.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';

export interface HelpResult {
  message: string;
}

/**
 * SHOW_HELP
 *
 * Previously: handleHelp(ctx: BotContext)
 */
export class ShowHelpHandler implements CommandHandler {
  async execute(_command: Command): Promise<HelpResult> {
    const message =
      `*Commands*\n\n` +
      `Send a meter photo - Submit a reading\n` +
      `/read <kWh> [type] - e.g. /read 150 solar_export\n` +
      `/balance - Check PCU balance\n` +
      `/status - View linked cluster\n` +
      `/register - Add mobile number\n` +
      `/history - View past submissions\n` +
      `/redeem <amount> - Cash out PCU\n` +
      `/transfer <amount> <@user> - Send PCU\n` +
      `/clusters - Browse communities\n` +
      `/resetmeter - Reset meter after replacement\n` +
      `/support - Ask Enerlectra support`;

    return { message };
  }
}