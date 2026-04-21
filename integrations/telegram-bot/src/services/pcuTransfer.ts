import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import crypto from 'node:crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

type TransferResult = {
  success: boolean;
  transferId?: string;
  errorMessage?: string;
  senderBalance?: number;
  receiverBalance?: number;
};

export interface PcuTransferRequest {
  fromUserId: string;
  toUsername: string;
  amountPcu: number;
  reference?: string;
  logger?: typeof logger;
}

export async function transferPCU(request: PcuTransferRequest): Promise<TransferResult> {
  const log = request.logger || logger;

  if (!request.fromUserId || !request.toUsername) {
    return { success: false, errorMessage: 'Missing sender or recipient.' };
  }

  if (!Number.isFinite(request.amountPcu) || request.amountPcu <= 0) {
    return { success: false, errorMessage: 'Transfer amount must be positive.' };
  }

  const reference = request.reference || crypto.randomUUID();

  const { data, error } = await supabase.rpc('transfer_pcu_atomic', {
    p_reference: reference,
    p_from_user_id: request.fromUserId,
    p_to_username: request.toUsername,
    p_amount_pcu: request.amountPcu,
  });

  if (error) {
    log.error(
      { error, fromUserId: request.fromUserId, toUsername: request.toUsername, reference },
      'PCU transfer RPC failed'
    );
    return { success: false, errorMessage: error.message || 'Transfer failed.' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    return {
      success: false,
      errorMessage: row?.error_message || 'Transfer failed.',
    };
  }

  return {
    success: true,
    transferId: row.transfer_id,
    senderBalance: row.sender_balance,
    receiverBalance: row.receiver_balance,
  };
}