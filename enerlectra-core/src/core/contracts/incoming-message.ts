// src/core/contracts/incoming-message.ts

export type MessageChannel =
  | 'telegram'
  | 'whatsapp'
  | 'sms'
  | 'web'
  | 'mobile_app'
  | 'api'
  | 'system'
  | 'excel_upload';

export type InteractionType =
  | 'text'
  | 'command'
  | 'button'
  | 'image'
  | 'document'
  | 'voice'
  | 'video'
  | 'location'
  | 'system_event';

export interface UnifiedUser {
  id: string;
  channel: MessageChannel;

  username?: string;
  phoneNumber?: string;
  displayName?: string;

  organizationId?: string;

  role:
    | 'tenant'
    | 'operator'
    | 'installer'
    | 'admin'
    | 'unknown';
}

export interface UnifiedMedia {
  id: string;

  type:
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'spreadsheet'
    | 'pdf'
    | 'voice'
    | 'other';

  url: string;

  mimeType: string;

  fileName?: string;

  fileSize?: number;
}

export interface IncomingMessageEvent {

  eventId: string;

  correlationId: string;

  conversationId: string;

  timestamp: string;

  channel: MessageChannel;

  interaction: InteractionType;

  sender: UnifiedUser;

  text?: string;

  media?: UnifiedMedia[];

  replyToMessageId?: string;

  metadata?: Record<string, unknown>;
}