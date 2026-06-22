import { supabase } from '../lib/supabase.js';
import { LedgerService } from 'enerlectra-core';
import pino from 'pino';
import crypto from 'node:crypto';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const WEIGHTS = {
  price: 0.45,
  amount: 0.35,
  time: 0.20,
};

interface Listing {
  id: string;
  seller_id: string;
  cluster_id: string;
  amount_kwh: number;
  price_per_kwh: number;
  created_at: string;
  expires_at: string | null;
  status: string;
}

interface Request {
  id: string;
  buyer_id: string;
  cluster_id: string;
  amount_kwh: number;
  max_price_per_kwh: number;
  created_at: string;
  expires_at: string | null;
  status: string;
}

interface Match {
  listing: Listing;
  request: Request;
  score: number;
  amount_kwh: number;
  price_per_kwh: number;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function calculateScore(listing: Listing, request: Request): number {
  const priceScore = Math.max(0, 1 - listing.price_per_kwh / request.max_price_per_kwh);
  const amountScore = Math.min(listing.amount_kwh, request.amount_kwh) / Math.max(listing.amount_kwh, request.amount_kwh);
  const ageHours = (Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60);
  const timeScore = Math.exp(-ageHours / 24);

  return (
    WEIGHTS.price * priceScore +
    WEIGHTS.amount * amountScore +
    WEIGHTS.time * timeScore
  );
}

async function fetchActiveListings(clusterId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('energy_listings')
    .select('id,seller_id,cluster_id,amount_kwh,price_per_kwh,created_at,expires_at,status')
    .eq('cluster_id', clusterId)
    .eq('status', 'ACTIVE')
    .order('price_per_kwh', { ascending: true });

  if (error) throw error;

  return (data ?? []).filter((l: Listing) => !isExpired(l.expires_at));
}

async function fetchOpenRequests(clusterId: string): Promise<Request[]> {
  const { data, error } = await supabase
    .from('energy_requests')
    .select('id,buyer_id,cluster_id,amount_kwh,max_price_per_kwh,created_at,expires_at,status')
    .eq('cluster_id', clusterId)
    .eq('status', 'OPEN')
    .order('max_price_per_kwh', { ascending: false });

  if (error) throw error;

  return (data ?? []).filter((r: Request) => !isExpired(r.expires_at));
}

export async function findBestMatches(clusterId: string): Promise<Match[]> {
  const listings = await fetchActiveListings(clusterId);
  const requests = await fetchOpenRequests(clusterId);

  if (!listings.length || !requests.length) return [];

  const pairs: { listing: Listing; request: Request; score: number }[] = [];

  for (const listing of listings) {
    for (const request of requests) {
      if (listing.seller_id === request.buyer_id) continue;
      if (listing.price_per_kwh > request.max_price_per_kwh) continue;

      const score = calculateScore(listing, request);
      pairs.push({ listing, request, score });
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  const matches: Match[] = [];
  const usedListingIds = new Set<string>();
  const usedRequestIds = new Set<string>();

  for (const pair of pairs) {
    if (usedListingIds.has(pair.listing.id) || usedRequestIds.has(pair.request.id)) continue;

    const amount = Math.min(pair.listing.amount_kwh, pair.request.amount_kwh);
    if (amount <= 0) continue;

    matches.push({
      listing: pair.listing,
      request: pair.request,
      score: pair.score,
      amount_kwh: amount,
      price_per_kwh: pair.listing.price_per_kwh,
    });

    usedListingIds.add(pair.listing.id);
    usedRequestIds.add(pair.request.id);
  }

  return matches;
}

async function reserveOrderRows(listingId: string, requestId: string): Promise<boolean> {
  const now = new Date().toISOString();

  const { data: listing, error: listingError } = await supabase
    .from('energy_listings')
    .update({ status: 'MATCHED', matched_at: now })
    .eq('id', listingId)
    .eq('status', 'ACTIVE')
    .select('id')
    .maybeSingle();

  if (listingError) throw listingError;
  if (!listing) return false;

  const { data: request, error: requestError } = await supabase
    .from('energy_requests')
    .update({ status: 'PARTIALLY_FILLED', filled_at: now })
    .eq('id', requestId)
    .in('status', ['OPEN', 'PARTIALLY_FILLED'])
    .select('id')
    .maybeSingle();

  if (requestError) throw requestError;
  if (!request) return false;

  return true;
}

export async function executeMatch(match: Match): Promise<void> {
  const { listing, request } = match;
  const amountKwh = Number(match.amount_kwh);
  const pricePerKwh = Number(match.price_per_kwh);
  const totalZmw = amountKwh * pricePerKwh;

  logger.info(
    { listing: listing.id, request: request.id, amount_kwh: amountKwh, price_per_kwh: pricePerKwh },
    'Executing match'
  );

  const reserved = await reserveOrderRows(listing.id, request.id);
  if (!reserved) {
    logger.warn({ listing: listing.id, request: request.id }, 'Match skipped because order was already reserved');
    return;
  }

  const { data: sellerAccount, error: sellerError } = await supabase
    .from('accounts')
    .select('account_id')
    .eq('contributor_id', listing.seller_id)
    .eq('unit', 'PCU')
    .maybeSingle();

  if (sellerError) throw sellerError;

  const { data: buyerAccount, error: buyerError } = await supabase
    .from('accounts')
    .select('account_id')
    .eq('contributor_id', request.buyer_id)
    .eq('unit', 'PCU')
    .maybeSingle();

  if (buyerError) throw buyerError;

  if (!sellerAccount || !buyerAccount) {
    throw new Error('Missing PCU accounts for seller or buyer');
  }

  const ledger = new LedgerService(supabase);
  const txId = crypto.randomUUID();

  try {
    const ledgerResult = await ledger.transfer({
      from_account_id: sellerAccount.account_id,
      to_account_id: buyerAccount.account_id,
      amount: amountKwh,
      settlement_cycle_id: txId,
      operation_type: 'ENERGY_TRADE',
      description: `Energy trade ${listing.id} → ${request.id}`,
    });

    const ledgerTxId = (ledgerResult as any)?.transaction_id || (ledgerResult as any)?.tx_id || txId;

    const { error: tradeError } = await supabase.from('energy_trades').insert({
      listing_id: listing.id,
      request_id: request.id,
      seller_id: listing.seller_id,
      buyer_id: request.buyer_id,
      cluster_id: listing.cluster_id,
      amount_kwh: amountKwh,
      price_per_kwh: pricePerKwh,
      total_zmw: totalZmw,
      match_score: match.score,
      ledger_tx_id: ledgerTxId,
      status: 'EXECUTED',
      executed_at: new Date().toISOString(),
    });

    if (tradeError) throw tradeError;

    const newListingAmount = Math.max(0, Number(listing.amount_kwh) - amountKwh);
    const newRequestAmount = Math.max(0, Number(request.amount_kwh) - amountKwh);

    await supabase
      .from('energy_listings')
      .update({
        amount_kwh: newListingAmount,
        status: newListingAmount <= 0.000001 ? 'MATCHED' : 'ACTIVE',
        matched_at: new Date().toISOString(),
      })
      .eq('id', listing.id);

    await supabase
      .from('energy_requests')
      .update({
        amount_kwh: newRequestAmount,
        status: newRequestAmount <= 0.000001 ? 'FILLED' : 'PARTIALLY_FILLED',
        filled_at: new Date().toISOString(),
      })
      .eq('id', request.id);

    logger.info(
      { txId, ledgerTxId, seller: listing.seller_id, buyer: request.buyer_id, amount_kwh: amountKwh },
      'Match executed successfully'
    );
  } catch (err) {
    await supabase.from('energy_listings').update({ status: 'ACTIVE' }).eq('id', listing.id);
    await supabase.from('energy_requests').update({ status: 'OPEN' }).eq('id', request.id);
    throw err;
  }
}

export async function runMatchingForCluster(clusterId: string): Promise<number> {
  const matches = await findBestMatches(clusterId);
  let executed = 0;

  for (const match of matches) {
    try {
      await executeMatch(match);
      executed++;
    } catch (err) {
      logger.error({ err, match }, 'Failed to execute match');
    }
  }

  return executed;
}
