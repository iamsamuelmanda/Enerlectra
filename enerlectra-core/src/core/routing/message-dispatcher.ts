// enerlectra-core/src/core/routing/message-dispatcher.ts

import { OutgoingMessageEvent } from '../contracts/outgoing-message.js';
import { ExecutionContext } from '../workflow/execution-context.js';
import { MessageRouter } from './message-router.js';

export class MessageDispatcher {
  constructor(
    private readonly router: MessageRouter
  ) {}

  async dispatch(event: OutgoingMessageEvent, context: ExecutionContext): Promise<boolean> {
    context.logger.info('[MessageDispatcher] Dispatching event', {
      eventId: event.eventId,
      channel: event.channel,
      recipientId: event.recipient.id,
    });

    return this.router.route(event, context);
  }

  async dispatchMany(events: OutgoingMessageEvent[], context: ExecutionContext): Promise<void> {
    for (const ev of events) {
      await this.dispatch(ev, context);
    }
  }
}