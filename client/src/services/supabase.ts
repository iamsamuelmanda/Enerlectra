/**
 * Supabase Client Configuration
 * Handles authentication and cluster data
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tlaqxnblzerlegezekml.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYXF4bmJsemVybGVnZXpla21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzQ5NTYsImV4cCI6MjA4NDg1MDk1Nn0.VtMnzSuboZYEmHjalglK21v1g-xVeTt_BCmPYW-5_Yk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Database types (based on your Supabase schema)
export interface Cluster {
  id: string;
  name: string;
  target_solar_kw: number;
  target_storage_kwh: number;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

// Auth helpers
export const authHelpers = {
  async signUp(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    return { data, error };
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },
};

// Cluster helpers
export const clusterHelpers = {
  async getClusters() {
    const { data, error } = await supabase
      .from('clusters')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data as Cluster[];
  },

  async getClusterById(id: string) {
    const { data, error } = await supabase
      .from('clusters')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Cluster;
  },
};