// enerlectra-core/src/core/intelligence/intent-resolver.ts

import { IncomingMessageEvent } from '../../core/contracts/incoming-message.js';

/**
 * High-level intents understood by the kernel.
 * These are channel-agnostic and map to concrete CommandType values
 * via the CommandFactory.
 */
export type Intent =
  | 'ShowBalance'
  | 'StartRedemptionFlow'
  | 'ShowHistory'
  | 'StartSupportSession'
  | 'GenerateToken'
  | 'ProcessMeterReadingImage'
  | 'GenericQuery';

export class IntentResolver {
  /**
   * Resolve an IncomingMessageEvent into an Intent.
   *
   * This is currently rules-based but can later be replaced or augmented
   * with an LLM-based resolver without changing WorkflowEngine or adapters.
   */
  resolve(event: IncomingMessageEvent): Intent {
    const text = (event.text ?? '').trim();
    const lowerText = text.toLowerCase();
    const callback = String(event.metadata?.callbackData ?? '').trim().toLowerCase();

    // Image interactions are always meter readings in this version
    if (event.interaction === 'image') {
      return 'ProcessMeterReadingImage';
    }

    if (event.interaction === 'button') {
      switch (callback) {
        case 'balance':
          return 'ShowBalance';
        case 'redeem':
          return 'StartRedemptionFlow';
        case 'history':
          return 'ShowHistory';
        case 'support':
          return 'StartSupportSession';
        default:
          return 'GenericQuery';
      }
    }

    if (event.interaction === 'text' || event.interaction === 'command') {
      if (lowerText.includes('balance')) {
        return 'ShowBalance';
      }
      if (lowerText.includes('redeem')) {
        return 'StartRedemptionFlow';
      }
      if (lowerText.includes('history')) {
        return 'ShowHistory';
      }
      if (lowerText.includes('support')) {
        return 'StartSupportSession';
      }
      if (lowerText.includes('token')) {
        return 'GenerateToken';
      }
      return 'GenericQuery';
    }

    // Fallback
    return 'GenericQuery';
  }
}