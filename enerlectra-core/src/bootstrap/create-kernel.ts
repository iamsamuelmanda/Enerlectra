import { ServiceRegistry } from '../core/registry/service-registry.js';
import { CommandBus } from '../core/bus/command-bus.js';
import { MessageRouter } from '../core/routing/message-router.js';
import { WorkflowEngine } from '../core/workflow/workflow-engine.js';

// Handlers
import { ShowBalanceHandler } from '../core/handlers/handlers/commands/balance.handler.js';
import { ShowHistoryHandler } from '../core/handlers/handlers/commands/history.handler.js';
import { StartRedemptionHandler } from '../core/handlers/handlers/commands/redeem.handler.js';
import { SupportHandler } from '../core/handlers/handlers/commands/support.handler.js';
import { GenerateTokenHandler } from '../core/handlers/handlers/commands/token.handler.js';
import { ProcessMeterReadingImageHandler } from '../core/handlers/handlers/commands/process-meter-reading-image.handler.js';
import { IntelligenceService } from '../domain/intelligence/intelligence-service.js';

// Senders
import { TelegramSender } from '../adapters/telegram/telegram-sender.js';
import { whatsAppClient } from '../adapters/whatsapp/sender.js';

export interface EnerlectraKernel {
  workflowEngine: WorkflowEngine;
  commandBus: CommandBus;
  messageRouter: MessageRouter;
  serviceRegistry: ServiceRegistry;
}

export function createKernel(telegramBot?: any): EnerlectraKernel {
  // 1. Service Registry & Handler Registration
  const serviceRegistry = new ServiceRegistry();

  const handlers = [
    { type: 'SHOW_BALANCE', handler: new ShowBalanceHandler() },
    { type: 'START_REDEMPTION_FLOW', handler: new StartRedemptionHandler() },
    { type: 'SHOW_HISTORY', handler: new ShowHistoryHandler() },
    { type: 'START_SUPPORT_SESSION', handler: new SupportHandler() },
    { type: 'GENERATE_TOKEN', handler: new GenerateTokenHandler() },
    { type: 'PROCESS_METER_READING_IMAGE', handler: new ProcessMeterReadingImageHandler() },
    { type: 'GENERIC_QUERY', handler: new IntelligenceService() },
  ];

  handlers.forEach(({ type, handler }) => {
    serviceRegistry.register(type, handler);
  });

  // 2. Command Bus
  const commandBus = new CommandBus(serviceRegistry);

  // 3. Message Router & Sender Registration
  const messageRouter = new MessageRouter();

  // Telegram Sender - only register if bot is provided
  if (telegramBot) {
    messageRouter.registerSender('telegram', new TelegramSender(telegramBot));
  }

  // WhatsApp Sender (Wrap WhatsAppClient to match IChannelSender)
  messageRouter.registerSender('whatsapp', {
    async sendMessage(event: any, context: any) {
      const { recipient, payload } = event;
      if (payload.type === 'text') {
        const result = await whatsAppClient.sendTemplate({
          mobile: recipient.id,
          bodyValues: { '1': payload.text ?? '' },
          templateId: process.env.AUTHKEY_ELLIE_TEMPLATE_ID,
        });
        return result.success;
      }
      if (payload.type === 'buttons') {
        const buttons = (payload.buttons ?? []).map((btn: any) => ({
          type: 'quick_reply' as const,
          text: btn.label,
          value: btn.value,
        }));
        const result = await whatsAppClient.sendTemplate({
          mobile: recipient.id,
          bodyValues: { '1': payload.text ?? '' },
          templateId: process.env.AUTHKEY_ELLIE_TEMPLATE_ID,
          buttons,
        });
        return result.success;
      }
      context.logger.warn('[WhatsAppWrapper] Unsupported payload.type', { type: payload.type, eventId: event.eventId });
      return false;
    },
  } as any);

  // 4. Workflow Engine
  const workflowEngine = new WorkflowEngine(commandBus, messageRouter);

  return {
    workflowEngine,
    commandBus,
    messageRouter,
    serviceRegistry,
  };
}