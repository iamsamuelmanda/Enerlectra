// core/commands/command-handler.ts
import type { Command } from './commands.js';

export interface CommandHandler<T = unknown> {
  execute(command: Command<T>): Promise<unknown>;
}