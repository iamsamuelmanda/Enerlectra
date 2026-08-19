// enerlectra-core/src/core/workflow/workflow-engine.ts

import crypto from 'node:crypto';
import { IncomingMessageEvent } from '../contracts/incoming-message.js';
import { Command } from '../contracts/commands.js';
import { ExecutionContext } from './execution-context.js';
import { ICommandBus } from '../bus/command-bus.js';
import { MessageRouter } from '../routing/message-router.js';
import {
  OutgoingMessageEvent,
  OutgoingMessagePayload,
} from '../contracts/outgoing-message.js';
import { logger } from '../services/logger.js';
import { IntentResolver } from '../../domain/intelligence/intent-resolver.js';
import { CommandFactory } from '../translation/command-factory.js';


export class WorkflowEngine {
  private readonly intentResolver = new IntentResolver();
  private readonly commandFactory = new CommandFactory();

  constructor(
    private readonly commandBus: ICommandBus,
    private readonly messageRouter: MessageRouter
  ) {}

  async processIncomingMessage(event: IncomingMessageEvent, context: ExecutionContext) {
    try {
      const start = performance.now();
      console.log(`[TRACE][WorkflowEngine_Process] { ${context.correlationId} } Input: ${event.channel}:${event.interaction}, Text: ${event.text}`);

      const intent = this.intentResolver.resolve(event);
      console.log(`[TRACE][IntentResolver] { ${context.correlationId} } Output: ${intent}`);

      const command = this.commandFactory.create(intent, event);
      console.log(`[TRACE][CommandFactory] { ${context.correlationId} } Output: ${command.type}`);

      // 1. Dispatch to domain layer
      const result = await this.commandBus.dispatch(command, context);
      console.log(`[TRACE][CommandBus_Result] { ${context.correlationId} } Output: ${JSON.stringify(result).substring(0, 100)}...`);

      // 2. Wrap result into unified OutgoingMessageEvent and route
      if (result !== undefined && result !== null) {
        const payload: OutgoingMessagePayload = this.mapResultToPayload(result, command);

        const outgoingEvent: OutgoingMessageEvent = {
          eventId: crypto.randomUUID(),
          correlationId: command.context.correlationId,
          timestamp: new Date().toISOString(),
          channel: event.channel,
          recipient: {
            id: event.sender.phoneNumber || event.sender.id,
            organizationId: event.sender.organizationId,
          },
          payload,
          metadata: {
            sourceCommandId: command.id,
            interactionType: event.interaction,
          },
        };

        await this.messageRouter.route(outgoingEvent, context);
      }
      
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[TRACE][WorkflowEngine_Complete] { ${context.correlationId} } Status: SUCCESS, TotalTime: ${duration}ms`);
    } catch (error) {
      logger.error({ error, context }, 'Failed to process incoming message');
    }
  }

  private mapResultToPayload(result: unknown, command: Command): OutgoingMessagePayload {
    try {
      if (typeof result === 'object' && result !== null) {
        const r = result as any;

        switch (command.type) {
          case 'SHOW_BALANCE': {
            const available = r.available ?? r.balance ?? 0;
            const lifetime = r.lifetime ?? r.totalEarned ?? 0;

            return {
              type: 'buttons',
              text:
                `*PCU Balance*\n\n` +
                `Available\n${available} PCU\n\n` +
                `Lifetime earned\n${lifetime} PCU`,
              buttons: [
                { id: 'redeem', label: 'Redeem', value: 'redeem' },
                { id: 'history', label: 'History', value: 'history' },
                { id: 'support', label: 'Support', value: 'support' },
              ],
              metadata: { parseMode: 'Markdown' },
            };
          }

          case 'SHOW_HISTORY': {
            const summaryText =
              r.summaryText ??
              '*Recent activity*\n\n' +
                (Array.isArray(r.items)
                  ? r.items
                      .map(
                        (item: any) =>
                          `${item.title ?? ''} — ${item.value ?? ''} — ${item.date ?? ''}`
                      )
                      .join('\n')
                  : '');

            return {
              type: 'buttons',
              text: summaryText,
              buttons: [
                { id: 'balance', label: 'Balance', value: 'balance' },
                { id: 'redeem', label: 'Redeem', value: 'redeem' },
              ],
              metadata: { parseMode: 'Markdown' },
            };
          }

          case 'START_REDEMPTION_FLOW': {
            const suggested = r.suggestedAmounts ?? [5, 10, 20];
            const prompt = r.promptText ?? 'Choose how much PCU to redeem:';

            return {
              type: 'buttons',
              text: prompt,
              buttons: suggested.map((amount: number) => ({
                id: `redeem_${amount}`,
                label: `Redeem ${amount} PCU`,
                value: `redeem:${amount}`,
              })),
              metadata: { parseMode: 'Markdown' },
            };
          }

          case 'START_SUPPORT_SESSION': {
            const msg =
              r.message ?? 'Tell us what you need help with, or choose an option:';

            return {
              type: 'buttons',
              text: msg,
              buttons: [
                { id: 'support_billing', label: 'Billing', value: 'support_billing' },
                { id: 'support_meter', label: 'Meter issues', value: 'support_meter' },
              ],
              metadata: { parseMode: 'Markdown' },
            };
          }

          case 'GENERATE_TOKEN': {
            const token = r.token ?? r.value;
            const meter = r.meterNumber ?? r.meter ?? '';
            const amount = r.amount ?? '';
            const text =
              `*Token generated*\n\n` +
              `Meter\n${meter}\n\n` +
              `Token\n\`${token}\`\n\n` +
              (amount ? `Amount\n${amount}\n` : '');

            return {
              type: 'buttons',
              text,
              buttons: [
                { id: 'history', label: 'History', value: 'history' },
                { id: 'support', label: 'Support', value: 'support' },
              ],
              templateId: process.env.AUTHKEY_TOKEN_TEMPLATE_ID,
              metadata: {
                parseMode: 'Markdown',
                variables: {
                  '1': meter,
                  '2': token,
                  '3': String(amount ?? ''),
                },
              },
            };
          }

          case 'PROCESS_METER_READING_IMAGE': {
            const msg = r.message ?? 'Reading processed.';
            return {
              type: 'buttons',
              text: msg,
              buttons: [
                { id: 'history', label: 'History', value: 'history' },
                { id: 'balance', label: 'Balance', value: 'balance' },
              ],
              metadata: { parseMode: 'Markdown' },
            };
          }

          default: {
            if (typeof r.text === 'string') {
              return {
                type: 'text',
                text: r.text,
                metadata: { parseMode: 'Markdown' },
              };
            }

            return {
              type: 'text',
              text: JSON.stringify(result, null, 2),
              metadata: { format: 'json' },
            };
          }
        }
      }

      if (typeof result === 'string') {
        return {
          type: 'text',
          text: result,
          metadata: { parseMode: 'Markdown' },
        };
      }

      return {
        type: 'text',
        text: String(result),
      };
    } catch (error) {
      logger.error({ error, result, command }, 'Failed to map result to payload');
      throw error;
    }
  }
}