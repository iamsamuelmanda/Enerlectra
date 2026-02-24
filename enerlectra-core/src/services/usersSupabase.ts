// server/services/usersSupabase.ts
import { supabase } from '../lib/supabase';
import {
  UserState,
  UserClass,
} from '../../enerlectra-core/src/domain/marketplace/engines/AntiWhaleEngine';

export interface UserRecord extends UserState {
  name: string;
  email: string;
  phone: string;
  location: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserParams {
  name: string;
  email: string;
  phone: string;
  location: string;
}

function mapRow(row: any): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    currentClass: row.current_class,
    totalInvestedUSD: Number(row.total_invested_usd),
    clusterCount: row.cluster_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createUser(
  params: CreateUserParams,
): Promise<UserRecord> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      name: params.name,
      email: params.email,
      phone: params.phone,
      location: params.location,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createUser error', error);
    throw error;
  }

  return mapRow(data);
}

export async function getUserById(
  userId: string,
): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('getUserById error', error);
    throw error;
  }

  if (!data) return null;
  return mapRow(data);
}

export async function getUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('getUserByEmail error', error);
    throw error;
  }

  if (!data) return null;
  return mapRow(data);
}

export async function updateUserClass(
  userId: string,
  newClass: UserClass,
): Promise<UserRecord> {
  const { data, error } = await supabase
    .from('users')
    .update({
      current_class: newClass,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    console.error('updateUserClass error', error);
    throw new Error(`User ${userId} not found or update failed`);
  }

  return mapRow(data);
}

export async function updateUserTotalInvested(
  userId: string,
  delta: number,
): Promise<UserRecord> {
  // Read current first
  const { data: existing, error: getError } = await supabase
    .from('users')
    .select('total_invested_usd')
    .eq('id', userId)
    .single();

  if (getError || !existing) {
    console.error('updateUserTotalInvested get existing error', getError);
    throw new Error(`User ${userId} not found`);
  }

  const newTotal = Number(existing.total_invested_usd) + delta;

  const { data, error } = await supabase
    .from('users')
    .update({
      total_invested_usd: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    console.error('updateUserTotalInvested error', error);
    throw error;
  }

  return mapRow(data);
}

export async function incrementUserClusterCount(
  userId: string,
): Promise<UserRecord> {
  const { data: existing, error: getError } = await supabase
    .from('users')
    .select('cluster_count')
    .eq('id', userId)
    .single();

  if (getError || !existing) {
    console.error('incrementUserClusterCount get existing error', getError);
    throw new Error(`User ${userId} not found`);
  }

  const newCount = Number(existing.cluster_count) + 1;

  const { data, error } = await supabase
    .from('users')
    .update({
      cluster_count: newCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    console.error('incrementUserClusterCount error', error);
    throw error;
  }

  return mapRow(data);
}
