// domains/intelligence/intelligence-service.ts
import { ICommandHandler } from '../../core/registry/service-registry.js';
import { Command } from '../../core/contracts/commands.js';
import { ExecutionContext } from '../../core/workflow/execution-context.js';
import { EllieWorker } from './workers/ellie-worker.js';

export class IntelligenceService implements ICommandHandler {
  private ellieWorker: EllieWorker;

  constructor() {
    this.ellieWorker = new EllieWorker();
  }

  async execute(command: Command, context: ExecutionContext) {
    context.logger.info(`[IntelligenceService] Dispatching to EllieWorker`, {
      correlationId: context.correlationId,
      commandType: command.type
    });

    // We extract the raw text from the payload
    // Note: Ensure the Command payload structure matches what Ellie expects
    const userText = (command.payload as any).rawText;
    const actorId = command.context.actorId;

    try {
      // Execute the worker logic
      const response = await this.ellieWorker.execute(
        userText, 
        context, 
        actorId
      );

      // Log success
      context.logger.info(`[IntelligenceService] Inference complete`);

      // In the full Enerlectra OS, the Service doesn't just return a string;
      // it should publish an 'OutgoingMessageEvent' to the EventBus.
      // For now, we return the string so the caller can handle the transport.
      return response;
    } catch (error) {
      context.logger.error(`[IntelligenceService] Worker failure`, { error });
      throw error;
    }
  }
}