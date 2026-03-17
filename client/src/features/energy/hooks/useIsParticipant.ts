import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useIsParticipant(userId?: string, clusterId?: string) {
  const [isParticipant, setIsParticipant] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !clusterId) {
      setLoading(false);
      return;
    }

    const check = async () => {
      try {
        const { data, error } = await supabase
          .from('participants')
          .select('id')
          .eq('user_id', userId)
          .eq('cluster_id', clusterId)
          .single();

        if (error && error.code !== 'PGRST116') throw error; // not found is ok
        setIsParticipant(!!data);
      } catch (err) {
        console.error('Participant check failed:', err);
        setIsParticipant(false);
      } finally {
        setLoading(false);
      }
    };

    check();

    // Realtime: if participant added/removed
    const channel = supabase
      .channel(`participant:${userId}:${clusterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `user_id=eq.${userId} AND cluster_id=eq.${clusterId}` },
        (payload) => {
          setIsParticipant(payload.eventType !== 'DELETE');
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId, clusterId]);

  return { isParticipant, loading };
}