// enerlectra-core/src/adapters/whatsapp/webhook-handler.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthkeyNormalizer } from './authkey-normalizer.js';
import { IncomingMessageEvent } from '../../core/contracts/incoming-message.js';
import { ExecutionContext } from '../../core/workflow/execution-context.js';
import { WorkflowEngine } from '../../core/workflow/workflow-engine.js';
import { resolveWhatsAppUserId } from '../../core/services/resolve-user.js';

export interface WhatsAppWebhookResult {
  success: boolean;
  messageId: string;
  processed: boolean;
  error?: string;
}

export class WhatsAppWebhookHandler {
  private normalizer = new AuthkeyNormalizer();

  // We now inject the WorkflowEngine alongside Supabase
  constructor(
    private supabase: SupabaseClient,
    private workflowEngine: WorkflowEngine
  ) {}

  async processInbound(raw: any): Promise<WhatsAppWebhookResult> {
    const message = this.normalizer.normalize(raw);
    if (!message) {
      return {
        success: false,
        messageId: 'unknown',
        processed: false,
        error: 'Could not normalize payload',
      };
    }

    // 1. Edge-Level Audit Logging (Kept exactly as you wrote it)
    const { error } = await this.supabase
      .from('communication_messages')
      .upsert(
        {
          message_id: message.messageId,
          channel: message.channel,
          direction: message.direction,
          from_number: message.fromNumber,
          body: message.body,
          message_type: message.type,
          payload: message.rawPayload,
          status: 'received',
          received_at: new Date().toISOString(),
        },
        { onConflict: 'message_id' }
      );
    if (error) {
      return {
        success: false,
        messageId: message.messageId,
        processed: false,
        error: error.message,
      };
    }

    // 2. Map to the Unified Contract
    const event: IncomingMessageEvent = {
      eventId: message.messageId,
      correlationId: message.messageId,
      conversationId: `whatsapp:${message.fromNumber}`,
      timestamp: new Date().toISOString(),
      channel: 'whatsapp',
      // The Kernel now knows this is WhatsApp
      interaction: message.type === 'image' ? 'image' : 'text',
      sender: {
        id: message.fromNumber,
        channel: 'whatsapp',
        phoneNumber: message.fromNumber,
        role: 'unknown',
      },
      text: message.body,
      metadata: { rawPayload: message.rawPayload },
    };

    // 3. Resolve WhatsApp user identity
    let actorId = '';
    let organizationId = '';
    try {
      actorId = await resolveWhatsAppUserId(message.fromNumber);
      organizationId = ''; // Org linking is a separate flow
    } catch (error) {
      console.error('Failed to resolve WhatsApp user identity:', error);
      // Continue with empty actorId - handlers will return appropriate error messages
    }

    // 4. Prepare the OS Context
    // We bundle the DB and a logger so the internal workers (like Ellie) can use them
    const executionContext: ExecutionContext = {
      supabase: this.supabase,
      logger: console, // You can swap this for Pino/Winston later
      correlationId: message.messageId,
      aiContext: {}, // Used for tracking conversation state
      actorId,
      organizationId,
      posthog: undefined,
    };

    try {
      const start = performance.now();
      console.log(`[TRACE][WorkflowEngine_Entry] { ${message.messageId} } Input: IncomingMessageEvent, Context: ${actorId}`);
      
      // 5. FIRE INTO THE KERNEL
      // This triggers the WorkflowEngine -> CommandBus -> IntelligenceService -> EllieWorker!
      await this.workflowEngine.processIncomingMessage(event, executionContext);
      
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[TRACE][WorkflowEngine_Exit] { ${message.messageId} } Status: SUCCESS, Time: ${duration}ms`);
      
      return {
        success: true,
        messageId: message.messageId,
        processed: true,
      };
    } catch (engineError) {
      console.error(
        `[WhatsAppWebhook] Kernel rejected event ${message.messageId}`,
        engineError
      );
      return {
        success: false,
        messageId: message.messageId,
        processed: false,
        error: 'Kernel processing failed',
      };
    }
  }
}