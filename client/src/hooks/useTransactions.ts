import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

type UserTransaction = {
  id: string;
  created_at: string;
  settlement_type: "yield";
  pcu_amount: number;
  amount_zwm: number;
};

export function useTransactions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-transactions", user?.id],
    enabled: !!user,
    retry: 1,
    queryFn: async () => {
      const base = (
        import.meta.env.VITE_API_URL ||
        "https://enerlectra-backend.onrender.com"
      ).replace(/\/api$/, "");
      const res = await fetch(`${base}/api/settlement/by-user/${user!.id}`);
      if (!res.ok) {
        throw new Error("Failed to load transactions");
      }
      const payload = await res.json();
      const settlements = (payload?.settlements ?? []) as Array<{
        id: string;
        created_at: string;
        kwh: number;
        amount_zwm: number;
      }>;

      return settlements.map((s): UserTransaction => ({
        id: s.id,
        created_at: s.created_at,
        settlement_type: "yield",
        pcu_amount: s.kwh ?? 0,
        amount_zwm: s.amount_zwm ?? 0,
      }));
    }
  });
}

