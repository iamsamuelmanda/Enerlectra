// src/core/contracts/outgoing-message.ts

import { MessageChannel } from './incoming-message.js';

export type OutgoingMessageType =
  | 'text'
  | 'template'
  | 'buttons'
  | 'list'
  | 'media'
  | 'file'
  | 'system';

export interface OutgoingButton {
  id: string;
  label: string;
  value: string;
}

export interface OutgoingMedia {
  url: string;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
}

export interface OutgoingRecipient {
  id: string;
  organizationId?: string;
}

export interface OutgoingMessagePayload {
  type: OutgoingMessageType;

  text?: string;

  templateId?: string;

  buttons?: OutgoingButton[];

  media?: OutgoingMedia[];

  metadata?: Record<string, unknown>;
}

export interface OutgoingMessageEvent {
  eventId: string;

  correlationId: string;

  timestamp: string;

  channel: MessageChannel;

  recipient: OutgoingRecipient;

  payload: OutgoingMessagePayload;

  metadata?: Record<string, unknown>;
}