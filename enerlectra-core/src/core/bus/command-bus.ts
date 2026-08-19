// src/core/bus/command-bus.ts
import { Command } from '../contracts/commands.js';
import { ExecutionContext } from '../workflow/execution-context.js';
import { ServiceRegistry } from '../registry/service-registry.js';

export interface ICommandBus {
  dispatch<T>(command: Command<T>, context: ExecutionContext): Promise<unknown>;
}

export class CommandBus implements ICommandBus {
  constructor(private registry: ServiceRegistry) {}

  async dispatch<T>(command: Command<T>, context: ExecutionContext): Promise<unknown> {
    const start = performance.now();
    console.log(`[TRACE][CommandBus_Dispatch] { ${context.correlationId} } Command: ${command.type}`);
    
    const handler = this.registry.getHandler(command.type);

    if (!handler) {
      context.logger.error(`[CommandBus] No handler registered for: ${command.type}`);
      throw new Error(`Command not supported: ${command.type}`);
    }

    try {
      const result = await handler.execute(command, context);
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[TRACE][CommandBus_Execute] { ${context.correlationId} } Handler: ${handler.constructor.name}, Time: ${duration}ms`);
      return result;
    } catch (error) {
      context.logger.error(`[CommandBus] Failed to execute ${command.type}`, { error });
      throw error;
    }
  }
}