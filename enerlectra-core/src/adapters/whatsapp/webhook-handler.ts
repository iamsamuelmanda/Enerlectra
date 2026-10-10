// V2 channel boundary — deliberately fail closed.
//
// This compatibility class remains exported for older integration packages,
// but it must not process messages until provider signature verification and
// canonical channel identity → Actor → active Membership → Organization
// resolution are implemented. The former implementation wrote to V1 tables
// and continued with an empty actor/organization after identity lookup failed.
// No message payload is persisted or forwarded from this boundary.

export interface WhatsAppWebhookResult {
  success: false;
  messageId: string;
  processed: false;
  error: 'WHATSAPP_V2_IDENTITY_ADAPTER_NOT_CONFIGURED';
}

export class WhatsAppWebhookHandler {
  // Keep accepting legacy constructor arguments so an old, unmounted caller
  // cannot break at construction time. They are intentionally never used.
  constructor(..._legacyDependencies: unknown[]) {}

  async processInbound(_raw: unknown): Promise<WhatsAppWebhookResult> {
    return {
      success: false,
      messageId: 'unprocessed',
      processed: false,
      error: 'WHATSAPP_V2_IDENTITY_ADAPTER_NOT_CONFIGURED',
    };
  }
}
