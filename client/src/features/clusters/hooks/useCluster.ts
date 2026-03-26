import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// 1. Hook for the Dashboard (List of all clusters)
export function useClusters() {
  return useQuery({
    queryKey: ["clusters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clusters")
        .select("id, name, location, lifecycle_state, image_url, current_funding, funding_goal")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });
}

// 2. Hook for ClusterDetailPage (Single cluster by ID)
export function useCluster(id: string | undefined) {
  return useQuery({
    queryKey: ["cluster", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clusters")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    }
  });
}
