// enerlectra-core/src/core/handlers/register.handler.ts

import type { Command } from '../../../contracts/commands.js';
import type { CommandHandler } from '../../../contracts/command-handler.js';

export interface RegisterResult {
  awaitingPhone: boolean;
  message: string;
}

/**
 * START_PHONE_REGISTRATION
 *
 * Previously: handleRegister(ctx: BotContext)
 */
export class StartPhoneRegistrationHandler implements CommandHandler {
  async execute(_command: Command): Promise<RegisterResult> {
    // Logic is identical: flip "awaiting phone" and prompt user.
    const message =
      'Reply with your mobile number:\n' +
      '`+260XXXXXXXXX` or `097XXXXXXX`';

    return {
      awaitingPhone: true,
      message,
    };
  }
}