import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export function useProtocolRealtime(clusterId: string) {
  const [latestReading, setLatestReading] = useState<any>(null);

  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meter_readings',
          filter: `cluster_id=eq.${clusterId}`
        },
        (payload) => {
          console.log('⚡ New Physical Truth Received:', payload.new);
          setLatestReading(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clusterId]);

  return { latestReading };
}