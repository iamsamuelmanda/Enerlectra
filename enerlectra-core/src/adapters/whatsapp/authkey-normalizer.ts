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
      const from = raw?.from || raw?.sender || raw?.mobile;
      if (!from) return null;

      // Extract body: handle text, button replies, and media captions
      const body = raw?.message || 
                   raw?.text?.body || 
                   raw?.body || 
                   raw?.button_value || 
                   raw?.interactive?.text || 
                   '';

      // For media (image/doc), we allow empty body as long as the type is correct
      const type = this.determineType(raw);
      if (!body && type === 'text') return null;

      return {
        messageId: String(raw?.id || raw?.messageId || raw?.message_id || crypto.randomUUID()),
        fromNumber: String(from),
        body: String(body),
        timestamp: raw?.timestamp ? Number(raw.timestamp) : Math.floor(Date.now() / 1000),
        type: type,
        channel: 'whatsapp',
        direction: 'inbound',
        rawPayload: raw,
      };
    } catch {
      return null;
    }
  }

  private determineType(raw: any): 'text' | 'image' | 'audio' | 'unknown' {
    const type = String(raw?.type || '').toLowerCase();
    if (type === 'text' || raw?.button_value || raw?.interactive) return 'text';
    if (type === 'image' || raw?.media_url?.includes('image')) return 'image';
    if (type === 'audio' || raw?.media_url?.includes('audio')) return 'audio';
    return 'unknown';
  }
}