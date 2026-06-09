// server/src/routes/staking.ts
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { LedgerService } from 'enerlectra-core';
import crypto from 'node:crypto';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const MINIMUM_STAKE = parseInt(process.env.MINIMUM_STAKE_PCU || '100');
const VALIDATOR_REWARD = parseFloat(process.env.VALIDATOR_REWARD_PCT || '0.05');

router.post('/stake', async (req, res) => {
  try {
    const { userId, amount_pcu } = req.body;
    if (!userId || !amount_pcu || amount_pcu < MINIMUM_STAKE) {
      return res.status(400).json({ error: `Minimum stake is ${MINIMUM_STAKE} PCU` });
    }

    const { data: wallet, error: walletError } = await supabase
      .from('pcu_balances')
      .select('balance_pcu')
      .eq('user_id', userId)
      .single();
    if (walletError || !wallet || wallet.balance_pcu < amount_pcu) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('account_id')
      .eq('contributor_id', userId)
      .eq('unit', 'PCU')
      .single();
    if (!account) return res.status(500).json({ error: 'Account not found' });

    const poolAccount = '00000000-0000-0000-0000-000000000001';

    const ledger = new LedgerService(supabase);
    await ledger.transfer({
      from_account_id: account.account_id,
      to_account_id: poolAccount,
      amount: amount_pcu,
      settlement_cycle_id: crypto.randomUUID(),
      operation_type: 'STAKE',
      description: `Stake PCU for user ${userId}`,
    });

    await supabase.from('stakes').insert({
      user_id: userId,
      amount_pcu: amount_pcu,
      status: 'active',
    });

    res.json({ success: true, staked: amount_pcu });
  } catch (error: any) {
    console.error('[STAKING ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/disputes', async (req, res) => {
  try {
    const { reading_id, challenger_id, reason } = req.body;
    if (!reading_id || !challenger_id) {
      return res.status(400).json({ error: 'reading_id and challenger_id required' });
    }

    const { data: reading } = await supabase
      .from('meter_readings')
      .select('user_id')
      .eq('id', reading_id)
      .single();
    if (!reading) return res.status(404).json({ error: 'Reading not found' });

    const { data: dispute, error } = await supabase
      .from('disputes')
      .insert({
        reading_id,
        challenger_id,
        defendant_id: reading.user_id,
        reason,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(dispute);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/disputes/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { validator_ids, decision } = req.body;
    if (!validator_ids || !decision) {
      return res.status(400).json({ error: 'validator_ids and decision required' });
    }

    for (const vid of validator_ids) {
      await supabase.from('dispute_votes').insert({
        dispute_id: id,
        validator_id: vid,
        vote: decision,
      });
    }

    const { count } = await supabase
      .from('dispute_votes')
      .select('*', { count: 'exact', head: true })
      .eq('dispute_id', id);

    if (count && count >= 3) {
      const status = decision === 'approve' ? 'resolved' : 'rejected';
      await supabase.from('disputes').update({ status, resolved_at: new Date().toISOString() }).eq('id', id);

      const reward = MINIMUM_STAKE * VALIDATOR_REWARD;
      for (const vid of validator_ids) {
        await supabase.rpc('increment_wallet_pcu', { p_user_id: vid, p_amount: reward });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
