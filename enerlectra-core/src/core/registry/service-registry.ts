// src/core/registry/service-registry.ts
import { Command } from '../contracts/commands.js';
import { ExecutionContext } from '../workflow/execution-context.js';

export interface ICommandHandler<T = unknown> {
  execute(command: Command<T>, context: ExecutionContext): Promise<any>;
}

export class ServiceRegistry {
  private handlers = new Map<string, ICommandHandler>();

  register<T>(commandType: string, handler: ICommandHandler<T>) {
    this.handlers.set(commandType, handler);
  }

  getHandler(commandType: string): ICommandHandler | undefined {
    return this.handlers.get(commandType);
  }
}