// C:\Users\Administrator\EnerlectraTrade\enerlectra-core\src\core\eventing\event-store.ts

import { createClient } from '@supabase/supabase-js';
import { BaseDomainEvent } from './event-types.js';

// Pull connection credentials straight from your environmental configuration variables
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

// Instantiate a dedicated database broker for the eventing engine
const supabase = createClient(supabaseUrl, supabaseKey);

export class EventStore {
  /**
   * Commits a domain event directly to the immutable database log table.
   * If this write fails, the operational execution chain halts instantly.
   */
  static async append(event: BaseDomainEvent): Promise<void> {
    const { error } = await supabase
      .from('event_log')
      .insert([
        {
          id: event.metadata.eventId,
          event_type: event.type,
          timestamp: event.metadata.timestamp,
          organization_id: event.metadata.organizationId,
          actor_id: event.metadata.actorId,
          version: event.metadata.version,
          payload: event.payload
        }
      ]);

    if (error) {
      // Echoes critical error statuses directly to your infrastructure logs
      console.error(`[CRITICAL EVENT STORE BLOCKED] Failed to write event [${event.type}]:`, error.message);
      throw new Error(`EventStorageException: Database write rejected -> ${error.message}`);
    }

    console.log(`[LEDGER COMMIT SUCCESS]: ${event.type} locked with trace ID -> ${event.metadata.eventId}`);
  }
}