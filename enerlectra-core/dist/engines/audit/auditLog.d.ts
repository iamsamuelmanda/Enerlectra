export interface AuditEvent {
    timestamp: string;
    eventType: string;
    actor?: string;
    clusterId?: string;
    payload: any;
}
/**
 * Append-only audit log.
 * NEVER modify or delete entries.
 * This is the system ledger.
 */
export declare function appendAuditEvent(event: Omit<AuditEvent, 'timestamp'>): void;
