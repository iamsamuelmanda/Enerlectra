import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function useUserAssets() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['user-assets', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: stakes, error } = await supabase
        .from('cluster_members')
        .select('*, clusters(name)')
        .eq('user_id', user!.id);

      if (error) throw error;

      const totalContribution = stakes?.reduce((sum, s) => sum + (s.contribution_amount || 0), 0) ?? 0;
      const totalPcu = stakes?.reduce((sum, s) => sum + (s.ownership_share || 0), 0) ?? 0;
      const nodeCount = stakes?.length ?? 0;

      return { stakes: stakes ?? [], totalContribution, totalPcu, nodeCount };
    },
  });

  const redeem = useMutation({
    mutationFn: async (amount: number) => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const voucher_code = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return { voucher_code };
    },
  });

  return { data, isLoading, redeem };
}
