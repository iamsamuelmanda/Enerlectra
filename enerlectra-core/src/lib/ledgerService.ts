// server/src/routes/ledger.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { LedgerService } from 'enerlectra-core';
import crypto from 'node:crypto';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * POST /api/ledger/transfer
 * Transfers PCU from sender to receiver using double‑entry ledger.
 */
router.post('/transfer', async (req, res) => {
  try {
    const { senderId, receiverId, amount, description } = req.body;

    if (!senderId || !receiverId || !amount || amount <= 0) {
      return res.status(400).json({
        error: 'Missing required fields: senderId, receiverId, amount > 0',
      });
    }

    // 1. Fetch sender PCU wallet from pcu_balances
    const { data: senderWallet, error: senderError } = await supabase
      .from('pcu_balances')
      .select('balance_pcu')
      .eq('user_id', senderId)
      .single();

    if (senderError || !senderWallet) {
      return res.status(404).json({ error: 'Sender wallet not found' });
    }

    if (senderWallet.balance_pcu < amount) {
      return res.status(400).json({
        error: `Insufficient PCU balance (have ${senderWallet.balance_pcu}, need ${amount})`,
      });
    }

    // 2. Ensure receiver wallet exists (create if missing)
    const { data: receiverWallet } = await supabase
      .from('pcu_balances')
      .select('balance_pcu, total_minted_pcu')
      .eq('user_id', receiverId)
      .single();

    const receiverBalance = receiverWallet?.balance_pcu ?? 0;
    const receiverMinted = receiverWallet?.total_minted_pcu ?? 0;

    if (!receiverWallet) {
      await supabase.from('pcu_balances').insert({
        user_id: receiverId,
        balance_pcu: 0,
        total_minted_pcu: 0,
      });
    }

    // 3. Get account IDs for both users (required for LedgerService)
    const { data: senderAccount } = await supabase
      .from('accounts')
      .select('account_id')
      .eq('contributor_id', senderId)
      .eq('account_type', 'CONTRIBUTOR')
      .eq('unit', 'PCU')
      .single();

    const { data: receiverAccount } = await supabase
      .from('accounts')
      .select('account_id')
      .eq('contributor_id', receiverId)
      .eq('account_type', 'CONTRIBUTOR')
      .eq('unit', 'PCU')
      .single();

    if (!senderAccount || !receiverAccount) {
      return res.status(500).json({ error: 'Account setup incomplete for one or both users' });
    }

    // 4. Perform atomic transfer using LedgerService
    const ledger = new LedgerService(supabase);
    const transferId = crypto.randomUUID();

    await ledger.transfer({
      from_account_id: senderAccount.account_id,
      to_account_id: receiverAccount.account_id,
      amount,
      unit: 'PCU',
      operation_type: 'PCU_TRANSFER',
      metadata: { description, transfer_id: transferId },
    });

    // 5. Fetch updated balances
    const { data: updatedSender } = await supabase
      .from('pcu_balances')
      .select('balance_pcu')
      .eq('user_id', senderId)
      .single();

    const { data: updatedReceiver } = await supabase
      .from('pcu_balances')
      .select('balance_pcu')
      .eq('user_id', receiverId)
      .single();

    return res.status(200).json({
      success: true,
      message: `${amount} PCU transferred`,
      from: senderId,
      to: receiverId,
      amount,
      transferId,
      balances: {
        sender: updatedSender?.balance_pcu ?? 0,
        receiver: updatedReceiver?.balance_pcu ?? 0,
      },
    });

  } catch (error: any) {
    console.error('[LEDGER TRANSFER ERROR]', error);
    return res.status(500).json({ error: error.message || 'Transfer failed' });
  }
});

/**
 * GET /api/ledger/balance/:userId
 */
router.get('/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('pcu_balances')
      .select('balance_pcu, total_minted_pcu, updated_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    return res.status(200).json({
      userId,
      balance_pcu: data.balance_pcu,
      total_minted_pcu: data.total_minted_pcu,
      updated_at: data.updated_at,
    });

  } catch (error: any) {
    console.error('[LEDGER BALANCE ERROR]', error);
    return res.status(500).json({ error: error.message || 'Balance lookup failed' });
  }
});

/**
 * GET /api/ledger/history/:userId
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get the user's PCU account ID first
    const { data: account } = await supabase
      .from('accounts')
      .select('account_id')
      .eq('contributor_id', userId)
      .eq('account_type', 'CONTRIBUTOR')
      .eq('unit', 'PCU')
      .single();

    if (!account) {
      return res.status(200).json({ userId, entries: [], count: 0 });
    }

    const { data, error } = await supabase
      .from('ledger_entries')
      .select('ledger_entry_id, debit_amount, credit_amount, unit, operation_type, description, created_at, transaction_id')
      .eq('account_id', account.account_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.status(200).json({
      userId,
      entries: data ?? [],
      count: data?.length ?? 0,
    });

  } catch (error: any) {
    console.error('[LEDGER HISTORY ERROR]', error);
    return res.status(500).json({ error: error.message || 'History lookup failed' });
  }
});

export default router;
