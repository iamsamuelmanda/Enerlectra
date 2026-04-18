import { supabase } from '../../../enerlectra-core/src/lib/supabase';

const MINIMUM_STAKE = parseInt(process.env.MINIMUM_STAKE_PCU || '100');
const VALIDATOR_REWARD = parseFloat(process.env.VALIDATOR_REWARD_PCT || '0.05');

/**
 * Stake PCU from a user's wallet into the validator pool.
 */
export async function stakePCU(userId: string, amount: number): Promise<void> {
  if (amount < MINIMUM_STAKE) {
    throw new Error(`Minimum stake is ${MINIMUM_STAKE} PCU`);
  }

  // 1. Verify sufficient balance
  const { data: wallet, error: walletError } = await supabase
    .from('energy_wallets')
    .select('available_pcu')
    .eq('user_id', userId)
    .single();

  if (walletError || !wallet) {
    throw new Error('Wallet not found');
  }

  if (wallet.available_pcu < amount) {
    throw new Error('Insufficient PCU balance');
  }

  // 2. Deduct from wallet
  const { error: updateError } = await supabase
    .from('energy_wallets')
    .update({
      available_pcu: wallet.available_pcu - amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) throw updateError;

  // 3. Create stake record
  const { error: stakeError } = await supabase
    .from('stakes')
    .insert({
      user_id: userId,
      amount_pcu: amount,
      status: 'active',
      staked_at: new Date().toISOString(),
    });

  if (stakeError) throw stakeError;

  // 4. Ledger entry (non-fatal)
  try {
    await supabase.from('ledger_entries').insert({
      from_account_id: `USER_WALLET_${userId}`,
      to_account_id: 'VALIDATOR_STAKE_POOL',
      amount,
      unit: 'PCU',
      operation_type: 'STAKE',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Ledger entry failed:', error);
  }

  console.log(`[STAKING] User ${userId} staked ${amount} PCU`);
}

/**
 * Resolve a dispute with validator votes.
 */
export async function resolveDispute(
  disputeId: string,
  validatorIds: string[],
  decision: 'approve' | 'reject'
): Promise<void> {
  // 1. Record votes
  const votes = validatorIds.map(vid => ({
    dispute_id: disputeId,
    validator_id: vid,
    vote: decision,
    voted_at: new Date().toISOString(),
  }));

  const { error: voteError } = await supabase
    .from('dispute_votes')
    .insert(votes);

  if (voteError) throw voteError;

  // 2. Check quorum (at least 3 validators)
  const { count } = await supabase
    .from('dispute_votes')
    .select('*', { count: 'exact', head: true })
    .eq('dispute_id', disputeId);

  if (count && count >= 3) {
    const status = decision === 'approve' ? 'resolved' : 'rejected';
    await supabase
      .from('disputes')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        decision,
      })
      .eq('id', disputeId);

    // 3. Reward validators
    const reward = MINIMUM_STAKE * VALIDATOR_REWARD;
    for (const vid of validatorIds) {
      try {
        await supabase.rpc('increment_wallet_pcu', {
          p_user_id: vid,
          p_amount: reward,
        });
      } catch (rewardError: any) {
        console.error(`Validator reward failed for ${vid}:`, rewardError);
      }
    }

    console.log(`[STAKING] Dispute ${disputeId} resolved as ${decision}`);
  }
}

/**
 * Get all active stakes for a user (read-only)
 */
export async function getUserStakes(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('stakes')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw error;
  return data || [];
}

/**
 * Get total PCU staked in the validator pool (read-only)
 */
export async function getTotalStaked(): Promise<number> {
  const { data, error } = await supabase
    .from('stakes')
    .select('amount_pcu', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) throw error;
  return data?.reduce((sum: number, stake: any) => sum + (stake.amount_pcu || 0), 0) || 0;
}