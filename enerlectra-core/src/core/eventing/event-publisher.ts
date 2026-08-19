// enerlectra-core/src/core/eventing/event-publisher.ts
import crypto from 'node:crypto';
import { EventStore } from './event-store.js';
import { eventBus } from './event-bus.js'; // Assuming this is where bus lives
import { BaseDomainEvent, EventType, EventMetadata } from './event-types.js';

export class EventPublisher {
  /**
   * Single entry point for all domain events.
   * Persists to ledger first, then distributes to subscribers.
   */
  static async publish(event: BaseDomainEvent): Promise<void> {
    await EventStore.append(event);
    await eventBus.publish(event.type, event.payload);
  }

  static subscribe(type: string, callback: (payload: any) => void) {
    return eventBus.subscribe(type, callback);
  }

  /**
   * Factory — nobody constructs events manually anywhere else.
   */
  static createEvent(
    type: EventType,
    organizationId: string,
    actorId: string,
    payload: Record<string, any>
  ): BaseDomainEvent {
    const metadata: EventMetadata = {
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorId,
      organizationId,
      version: 1,
    };
    return { type, metadata, payload };
  }
}