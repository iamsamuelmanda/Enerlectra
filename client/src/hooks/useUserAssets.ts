import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";

export function useUserAssets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["user-assets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: stakes, error: stakeError } = await supabase
        .from("cluster_members")
        .select(`cluster_id, contribution_amount, ownership_share, clusters(name, location)`)
        .eq("user_id", user!.id);

      if (stakeError) throw stakeError;

      const { data: settlements, error: setError } = await supabase
        .from("settlements")
        .select("pcu_amount")
        .eq("user_id", user!.id);

      const totalPcu = settlements?.reduce((acc, curr) => acc + (Number(curr.pcu_amount) || 0), 0) || 0;
      const totalContribution = stakes?.reduce((acc, curr) => acc + (Number(curr.contribution_amount) || 0), 0) || 0;

      return { stakes: stakes || [], totalPcu, totalContribution, nodeCount: stakes?.length || 0 };
    }
  });

  const redeem = useMutation({
    mutationFn: async (amount: number) => {
      // Calls a Supabase RPC that deducts PCU and generates a voucher
      const { data, error } = await supabase.rpc('redeem_pcu_for_voucher', { 
        user_id_param: user!.id, 
        amount_param: amount 
      });
      if (error) throw error;
      return data; // Should return { voucher_code: "XXXX-XXXX" }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-assets"] });
      toast.success("Voucher generated successfully!");
    },
    onError: (err: any) => toast.error(err.message || "Redemption failed")
  });

  return { ...query, redeem };
}
