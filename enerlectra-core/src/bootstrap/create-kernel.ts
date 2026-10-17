import { ServiceRegistry } from '../core/registry/service-registry.js';
import { CommandBus } from '../core/bus/command-bus.js';
import { MessageRouter } from '../core/routing/message-router.js';
import { WorkflowEngine } from '../core/workflow/workflow-engine.js';

export interface EnerlectraKernel {
  workflowEngine: WorkflowEngine;
  commandBus: CommandBus;
  messageRouter: MessageRouter;
  serviceRegistry: ServiceRegistry;
}

export function createKernel(_telegramBot?: any): EnerlectraKernel {
  // 1. Service Registry & Handler Registration
  const serviceRegistry = new ServiceRegistry();

  // Legacy PCU/cluster/token/redemption handlers are intentionally not registered.
  // V2 capabilities are exposed through tenant-scoped server routes/services.
  // Keep the registry empty until a bounded V2 channel command is defined.

  // 2. Command Bus
  const commandBus = new CommandBus(serviceRegistry);

  // 3. Message Router & Sender Registration
  const messageRouter = new MessageRouter();

  // Channel senders are registered by their V2 adapters, after canonical
  // Actor → Membership → Organization resolution. The old global WhatsApp
  // sender registration is deliberately removed from the kernel.

  // 4. Workflow Engine
  const workflowEngine = new WorkflowEngine(commandBus, messageRouter);

  return {
    workflowEngine,
    commandBus,
    messageRouter,
    serviceRegistry,
  };
}