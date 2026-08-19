// enerlectra-core/src/adapters/telegram/telegram-sender.ts

import type { Telegraf, Context } from 'telegraf';
import { IChannelSender } from '../../core/routing/message-router.js';
import { OutgoingMessageEvent } from '../../core/contracts/outgoing-message.js';
import { ExecutionContext } from '../../core/workflow/execution-context.js';

export class TelegramSender implements IChannelSender {
  constructor(private readonly bot: Telegraf<Context>) {}

  async sendMessage(event: OutgoingMessageEvent, ctx: ExecutionContext): Promise<boolean> {
    const { recipient, payload } = event;

    try {
      if (payload.type === 'text') {
        await this.bot.telegram.sendMessage(recipient.id, payload.text ?? '', {
          parse_mode: payload.metadata?.parseMode as any,
        });
      } else if (payload.type === 'buttons') {
        await this.bot.telegram.sendMessage(recipient.id, payload.text ?? '', {
          parse_mode: payload.metadata?.parseMode as any,
          reply_markup: {
            inline_keyboard: (payload.buttons ?? []).map((b) => [
              { text: b.label, callback_data: b.value },
            ]),
          },
        });
      } else {
        ctx.logger.warn('[TelegramSender] Unsupported payload.type', {
          eventId: event.eventId,
          type: payload.type,
        });
        return false;
      }

      return true;
    } catch (err) {
      ctx.logger.error('[TelegramSender] Failed to send message', {
        eventId: event.eventId,
        to: recipient.id,
        error: err,
        payload,
      });
      return false;
    }
  }
}