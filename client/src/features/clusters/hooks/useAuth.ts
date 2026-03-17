'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    error: null,
  });

  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (mounted) {
          setState({
            user: session?.user ?? null,
            session,
            isLoading: false,
            error: null,
          });
        }
      } catch (err: any) {
        console.error('Initial session failed:', err);
        if (mounted) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: err.message || 'Session load failed',
          }));
        }
      }
    };

    initialize();

    // Auth listener (only once)
    if (!subscriptionRef.current) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log(`Auth event: ${event}`, session?.user?.id || 'no user');

        if (mounted) {
          setState({
            user: session?.user ?? null,
            session,
            isLoading: false,
            error: null,
          });
        }
      });

      subscriptionRef.current = subscription;
    }

    return () => {
      mounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, []);

  // Periodic refresh (every 10 min)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setState(prev => ({ ...prev, session, user: session.user }));
        }
      } catch (err) {
        console.warn('Session refresh failed:', err);
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return state;
}