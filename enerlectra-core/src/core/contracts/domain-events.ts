// src/core/contracts/domain-events.ts
export interface DomainEvent<T = unknown> {
    id: string;
    type: string;
    aggregateId: string;
    aggregateType: string;
    payload: T;
    timestamp: string;
    metadata: {
      actorId: string;
      organizationId: string;
      correlationId: string;
      causationId?: string;
      version: number;
    };
  }