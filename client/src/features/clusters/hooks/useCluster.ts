import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useClusters() {
  return useQuery({
    queryKey: ["clusters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clusters")
        .select("id, name, location, lifecycle_state, image_url")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase error (clusters):", error);
        throw error;
      }
      return data || [];
    }
  });
}
