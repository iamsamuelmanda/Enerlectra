// src/core/workflow/command-router.ts
import { Command } from '../contracts/commands.js';
import { ServiceRegistry } from '../registry/service-registry.js';
import { ExecutionContext } from './execution-context.js'; // Updated path

export class CommandRouter {
  constructor(private registry: ServiceRegistry) {}

  async dispatch(command: Command, context: ExecutionContext) {
    const handler = this.registry.getHandler(command.type);
    
    if (!handler) {
      context.logger.error(`No handler registered for command: ${command.type}`);
      throw new Error(`Command not supported: ${command.type}`);
    }

    context.logger.info(`Routing command: ${command.type}`);
    return await handler.execute(command, context);
  }
}