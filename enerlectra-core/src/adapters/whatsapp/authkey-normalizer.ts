import crypto from 'node:crypto';

export interface CanonicalMessage {
  messageId: string;
  fromNumber: string;
  body: string;
  timestamp: number;
  type: 'text' | 'image' | 'audio' | 'unknown';
  channel: 'whatsapp';
  direction: 'inbound';
  rawPayload: any;
}

export class AuthkeyNormalizer {
  normalize(raw: any): CanonicalMessage | null {
    try {
      // Authkey WABA payload structure:
      // raw.eventContent.message
      const message = raw?.eventContent?.message;

      if (!message) {
        console.error(
          '[AuthkeyNormalizer] Missing eventContent.message',
          JSON.stringify(raw, null, 2)
        );
        return null;
      }

      const from = message.from;
      const messageId = message.id;

      if (!from || !messageId) {
        console.error(
          '[AuthkeyNormalizer] Missing sender or message ID',
          JSON.stringify(message, null, 2)
        );
        return null;
      }

      // Authkey text message:
      // message.text.body
      const body = message.text?.body || '';

      const type = this.determineType(raw);

      // Text messages must contain text.
      if (type === 'text' && !body.trim()) {
        console.error('[AuthkeyNormalizer] Text message has empty body');
        return null;
      }

      return {
        messageId: String(messageId),
        fromNumber: String(from),
        body: String(body),
        timestamp: this.extractTimestamp(raw),
        type,
        channel: 'whatsapp',
        direction: 'inbound',
        rawPayload: raw,
      };
    } catch (error) {
      console.error('[AuthkeyNormalizer] Normalization failed', error);
      return null;
    }
  }

  private extractTimestamp(raw: any): number {
    const timestamp = Number(raw?.events?.timestamp);

    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }

    return Math.floor(Date.now() / 1000);
  }

  private determineType(raw: any): 'text' | 'image' | 'audio' | 'unknown' {
    const message = raw?.eventContent?.message;

    const contentType = String(
      message?.contentType ||
      message?.messageType ||
      ''
    ).toLowerCase();

    if (contentType === 'text') {
      return 'text';
    }

    if (contentType === 'image') {
      return 'image';
    }

    if (contentType === 'audio') {
      return 'audio';
    }

    // Authkey also supplies media_url.
    const mediaUrl = String(raw?.media_url || '').toLowerCase();

    if (mediaUrl.includes('image')) {
      return 'image';
    }

    if (mediaUrl.includes('audio')) {
      return 'audio';
    }

    return 'unknown';
  }
      }
