import { BaseDomainEvent, EventType } from './event-types.js';

export type EventHandler = (event: any) => Promise<void>;

export class EventRouter {
  // Map event types to arrays of registered callback handlers
  private static handlers: Map<EventType, EventHandler[]> = new Map();

  /**
   * Registers a specific workflow engine to listen for a specific event type.
   */
  static subscribe(type: EventType, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)?.push(handler);
    console.log(`[ROUTER SUBSCRIPTION]: Workflow registered for event -> ${type}`);
  }

  /**
   * Dispatches an event to all interested background workflows.
   * This evaluates the metadata to ensure multi-tenant separation.
   */
  static async dispatch(event: BaseDomainEvent): Promise<void> {
    const matchingHandlers = this.handlers.get(event.type) || [];
    
    if (matchingHandlers.length === 0) {
      console.log(`[ROUTER WARN]: No background workflows registered for event: ${event.type}`);
      return;
    }

    // Execute all matching workflows concurrently in the background
    const executions = matchingHandlers.map(async (handler) => {
      try {
        await handler(event);
      } catch (err: any) {
        console.error(
          `[ROUTER ERROR]: Workflow failed executing event [${event.type}] for Org [${event.metadata.organizationId}]:`,
          err.message
        );
      }
    });

    await Promise.all(executions);
  }
}