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
    mutationFn: async ({ amount, phoneNumber }: { amount: number; phoneNumber: string }) => {
      if (!user?.id) throw new Error('Please sign in first');
      const base = (
        import.meta.env.VITE_API_URL ||
        'https://enerlectra-backend.onrender.com'
      ).replace(/\/api$/, '');

      const res = await fetch(`${base}/api/payments/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          amountPcu: amount,
          phoneNumber,
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Redemption failed');
      return payload as { reference: string; status: string; providerRef?: string | null };
    },
  });

  return { data, isLoading, redeem };
}
