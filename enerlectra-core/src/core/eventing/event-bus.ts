import { EventEmitter } from 'node:events';

export interface EventBus {
  publish(eventType: string, payload: Record<string, any>): Promise<void>;
  subscribe(eventType: string, handler: (payload: any) => Promise<void> | void): void;
}

class InMemoryEventBus implements EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(30);
  }

  async publish(eventType: string, payload: Record<string, any>): Promise<void> {
    setImmediate(() => {
      this.emitter.emit(eventType, payload);
    });
  }

  subscribe(eventType: string, handler: (payload: any) => Promise<void> | void): void {
    this.emitter.on(eventType, async (payload) => {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`[EventBus] Subscriber failed for ${eventType}:`, error);
      }
    });
  }
}

export const eventBus = new InMemoryEventBus();