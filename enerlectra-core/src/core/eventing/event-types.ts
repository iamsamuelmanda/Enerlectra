// enerlectra-core/src/core/eventing/event-types.ts

export type EventMetadata = {
  eventId: string;
  timestamp: string;
  actorId: string;
  organizationId: string;
  version: number;
};

export enum EventType {
  PAYMENT_RECEIVED = 'money.payment_received',
  TOKEN_GENERATED = 'energy.token_generated',
  NOTIFICATION_DISPATCHED = 'communications.notification_dispatched',
  MESSAGE_RECEIVED = 'customer.message_received',
  NOTIFICATION_REQUESTED = 'communication.notification_requested',
}

export interface BaseDomainEvent {
  type: EventType;
  metadata: EventMetadata;
  payload: Record<string, any>;
}

export interface PaymentReceivedEvent extends BaseDomainEvent {
  type: EventType.PAYMENT_RECEIVED;
  payload: {
    transactionId: string;
    gateway: 'mtn' | 'airtel' | 'zamtel';
    amount: number;
    currency: 'ZMW';
    senderPhoneNumber: string;
    meterSerialNumber: string;
  };
}

export interface TokenGeneratedEvent extends BaseDomainEvent {
  type: EventType.TOKEN_GENERATED;
  payload: {
    tokenId: string;
    associatedPaymentId: string;
    meterSerialNumber: string;
    tokenCode: string;
    kilowattHours: number;
  };
}

export interface NotificationDispatchedEvent extends BaseDomainEvent {
  type: EventType.NOTIFICATION_DISPATCHED;
  payload: {
    recipientPhoneNumber: string;
    channel: 'whatsapp' | 'sms';
    messageBody: string;
    deliveryStatus: 'pending' | 'sent';
  };
}

// 4. Customer sends a message via any channel
export interface MessageReceivedEvent extends BaseDomainEvent {
  type: EventType.MESSAGE_RECEIVED;
  payload: {
    messageId: string;
    fromNumber: string;
    body: string;
    channel: 'whatsapp' | 'telegram';
    receivedAt: string;
  };
}

// 5. A domain service requests an outbound notification
export interface NotificationRequestedEvent extends BaseDomainEvent {
  type: EventType.NOTIFICATION_REQUESTED;
  payload: {
    recipientPhoneNumber: string;
    channel: 'whatsapp' | 'telegram' | 'sms';
    messageBody: string;
    templateId?: string;
  };
}

// Union type — use this everywhere instead of BaseDomainEvent
export type DomainEvent =
  | PaymentReceivedEvent
  | TokenGeneratedEvent
  | NotificationDispatchedEvent
  | MessageReceivedEvent
  | NotificationRequestedEvent;