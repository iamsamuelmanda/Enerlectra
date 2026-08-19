// enerlectra-core/src/core/routing/message-router.ts

import { OutgoingMessageEvent } from '../contracts/outgoing-message.js';
import { MessageChannel } from '../contracts/incoming-message.js';
import { ExecutionContext } from '../workflow/execution-context.js';

// Channel adapter: one implementation per channel (telegram, whatsapp, sms, etc.).
export interface IChannelSender {
  sendMessage(
    event: OutgoingMessageEvent,
    context: ExecutionContext
  ): Promise<boolean>;
}

export class MessageRouter {
  private senders: Map<MessageChannel, IChannelSender> = new Map();

  registerSender(channel: MessageChannel, sender: IChannelSender) {
    this.senders.set(channel, sender);
  }

  async route(event: OutgoingMessageEvent, context: ExecutionContext): Promise<boolean> {
    const start = performance.now();
    console.log(`[TRACE][MessageRouter] { ${context.correlationId} } Routing to channel: ${event.channel}, PayloadType: ${event.payload.type}`);
    
    const sender = this.senders.get(event.channel);

    if (!sender) {
      context.logger.error(
        `[MessageRouter] Drop: No sender registered for channel '${event.channel}'`,
        { eventId: event.eventId }
      );
      return false;
    }

    try {
      context.logger.info(
        `[MessageRouter] Routing ${event.payload.type} reply to ${event.recipient.id} via ${event.channel}`,
        {
          eventId: event.eventId,
          channel: event.channel,
          recipientId: event.recipient.id,
          correlationId: event.correlationId,
        }
      );

      const ok = await sender.sendMessage(event, context);
      
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[TRACE][MessageRouter_Exit] { ${context.correlationId} } Status: ${ok ? 'SUCCESS' : 'FAILED'}, Time: ${duration}ms`);

      if (!ok) {
        context.logger.warn(
          `[MessageRouter] Sender reported failure on ${event.channel}`,
          { eventId: event.eventId }
        );
      }

      return ok;
    } catch (error) {
      context.logger.error(
        `[MessageRouter] Delivery failure on ${event.channel}`,
        { eventId: event.eventId, error }
      );
      return false;
    }
  }
}