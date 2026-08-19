// enerlectra-core/src/adapters/whatsapp/sender-adapter.ts

import { IChannelSender } from '../../core/routing/message-router.js';
import { OutgoingMessageEvent } from '../../core/contracts/outgoing-message.js';
import { ExecutionContext } from '../../core/workflow/execution-context.js';
import { whatsAppClient } from './sender.js';

export class WhatsAppSender implements IChannelSender {
  async sendMessage(event: OutgoingMessageEvent, ctx: ExecutionContext): Promise<boolean> {
    const { recipient, payload } = event;

    if (payload.type !== 'text' && payload.type !== 'template' && payload.type !== 'buttons') {
      ctx.logger.warn('[WhatsAppSender] Unsupported payload.type for Authkey', {
        eventId: event.eventId,
        type: payload.type,
      });
      return false;
    }

    const templateId = payload.templateId || process.env.AUTHKEY_ELLIE_TEMPLATE_ID || '40109';

    const bodyValues: Record<string, string> = {};

    const variables = payload.metadata?.variables as Record<string, unknown> | undefined;
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        bodyValues[key] = String(value);
      });
    }

    if (!Object.keys(bodyValues).length && payload.text) {
      bodyValues['1'] = payload.text;
    }

    const mobile = recipient.id;

    try {
      const result = await whatsAppClient.sendTemplate({
        mobile,
        bodyValues,
        templateId,
      });

      if (!result.success) {
        ctx.logger.error('[WhatsAppSender] Authkey send failed', {
          eventId: event.eventId,
          to: mobile,
          error: result.error,
          raw: result.raw,
        });
        return false;
      }

      ctx.logger.info('[WhatsAppSender] Message sent via Authkey', {
        eventId: event.eventId,
        to: mobile,
        providerMessageId: result.providerMessageId,
      });

      return true;
    } catch (err) {
      ctx.logger.error('[WhatsAppSender] Unexpected error sending WhatsApp message', {
        eventId: event.eventId,
        to: mobile,
        error: err,
      });
      return false;
    }
  }
}