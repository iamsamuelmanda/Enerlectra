// enerlectra-core/src/core/contracts/commands.ts

export type CommandType =
  | 'SHOW_BALANCE'
  | 'START_REDEMPTION_FLOW'
  | 'SHOW_HISTORY'
  | 'START_SUPPORT_SESSION'
  | 'GENERATE_TOKEN'
  | 'PROCESS_METER_READING_IMAGE'
  | 'GENERIC_QUERY';

export interface Command<T = unknown> {
  id: string;
  type: CommandType;
  payload: T;
  timestamp: string;
  context: {
    actorId: string;
    organizationId: string;
    correlationId: string;
    causationId?: string;
    source: 'whatsapp' | 'telegram' | 'sms' | 'excel' | 'api' | 'system' | 'web' | 'mobile_app';
    initiatedBy: 'user' | 'ai' | 'workflow' | 'system';
    session?: {
      clusterId?: string;
    };
  };
}
