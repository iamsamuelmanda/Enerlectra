import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

export function useAdminActions() {
  const queryClient = useQueryClient();

  const distributeYield = useMutation({
    mutationFn: async ({ clusterId, totalKwh }: { clusterId: string, totalKwh: number }) => {
      // This RPC will multiply (totalKwh * member.ownership_share) and insert into settlements
      const { data, error } = await supabase.rpc('distribute_cluster_yield', {
        cluster_id_param: clusterId,
        total_pcu_param: totalKwh
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-assets"] });
      queryClient.invalidateQueries({ queryKey: ["user-transactions"] });
      toast.success("Yield distributed to all node members!");
    },
    onError: (err: any) => toast.error(err.message || "Distribution failed")
  });

  return { distributeYield };
}
