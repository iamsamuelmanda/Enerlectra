// enerlectra-core/src/core/translation/command-factory.ts

import crypto from 'node:crypto';
import { IncomingMessageEvent } from '../contracts/incoming-message.js';
import { Command, CommandType } from '../contracts/commands.js';
import { Intent } from '../../domain/intelligence/intent-resolver.js';

/**
 * CommandFactory
 *
 * Translates a high-level Intent + IncomingMessageEvent
 * into a concrete Command object that the CommandBus can dispatch.
 */
export class CommandFactory {
  create(intent: Intent, event: IncomingMessageEvent): Command {
    const text = (event.text ?? '').trim();
    const callback = String(event.metadata?.callbackData ?? '').trim().toLowerCase();
    const correlationId = crypto.randomUUID();

    const type: CommandType = this.mapIntentToCommandType(intent);

    return {
      id: crypto.randomUUID(),
      type,
      payload: {
        rawText: text,
        callback,
        channel: event.channel,
        interaction: event.interaction,
        senderId: event.sender.id,
        media: event.media ?? [],
        metadata: event.metadata ?? {},
      },
      timestamp: new Date().toISOString(),
      context: {
        actorId: event.sender.id,
        organizationId: event.sender.organizationId ?? 'default-org',
        correlationId,
        source: event.channel as 'telegram' | 'whatsapp' | 'sms' | 'api' | 'system' | 'excel',
        initiatedBy: 'user',
      },
    };
  }

  private mapIntentToCommandType(intent: Intent): CommandType {
    switch (intent) {
      case 'ShowBalance':
        return 'SHOW_BALANCE';
      case 'StartRedemptionFlow':
        return 'START_REDEMPTION_FLOW';
      case 'ShowHistory':
        return 'SHOW_HISTORY';
      case 'StartSupportSession':
        return 'START_SUPPORT_SESSION';
      case 'GenerateToken':
        return 'GENERATE_TOKEN';
      case 'ProcessMeterReadingImage':
        return 'PROCESS_METER_READING_IMAGE';
      case 'GenericQuery':
      default:
        return 'GENERIC_QUERY';
    }
  }
}