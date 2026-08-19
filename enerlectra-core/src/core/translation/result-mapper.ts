// enerlectra-core/src/core/translation/result-mapper.ts

import { Command } from '../contracts/commands.js';
import {
  OutgoingMessagePayload,
} from '../contracts/outgoing-message.js';

/**
 * ResultMapper
 *
 * Translates handler results into an OutgoingMessagePayload
 * that MessageRouter and channel senders can deliver.
 *
 * NOTE: Channel-specific concerns (Markdown, WhatsApp templates)
 * still appear in metadata for now but should eventually move into
 * TelegramSender/WhatsAppSender renderers.
 */
export class ResultMapper {
  map(result: unknown, command: Command, _event: unknown): OutgoingMessagePayload {
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
            metadata: { parseMode: 'Markdown' }, // to move into TelegramSender later
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
                        `${item.title ?? ''} — ${item.value ?? ''} — ${item.date ?? ''}`,
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
            metadata: {
              parseMode: 'Markdown',
              variables: {
                '1': meter,
                '2': token,
                '3': String(amount ?? ''),
              },
              // AUTHKEY template IDs should eventually move into WhatsAppSender
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
  }
}