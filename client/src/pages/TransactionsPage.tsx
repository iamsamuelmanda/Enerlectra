import { useTransactions } from "@/hooks/useTransactions";
import { ArrowDownLeft, ArrowUpRight, Zap, Ticket, Clock, Filter } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { format } from "date-fns";

export default function TransactionsPage() {
  const { data: txs, isLoading } = useTransactions();

  if (isLoading) return <div className="p-20 text-center animate-pulse font-black text-white/20">LOADING LEDGER...</div>;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-display font-black tracking-tighter uppercase italic text-white">Grid Ledger</h1>
        <p className="text-white/50 mt-2">Audit trail of all energy yields and voucher redemptions.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-brand-primary" />
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Transaction History</h3>
          </div>
          <button className="text-[10px] font-black text-white/30 uppercase tracking-widest flex items-center gap-1 hover:text-white transition-colors">
            <Filter size={12} /> Filter
          </button>
        </div>

        <Card variant="glass" className="overflow-hidden">
          <div className="divide-y divide-white/5">
            {txs?.map((tx) => (
              <div key={tx.id} className="p-6 flex items-center justify-between hover:bg-white/[0.01] transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${tx.pcu_amount > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-brand-primary/10 text-brand-primary'}`}>
                    {tx.pcu_amount > 0 ? <ArrowDownLeft size={20} /> : <Ticket size={20} />}
                  </div>
                  <div>
                    <p className="font-bold text-white capitalize">{tx.settlement_type === 'redemption' ? 'Meter Voucher' : 'Grid Yield'}</p>
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-tight">
                      {format(new Date(tx.created_at), 'MMM dd, yyyy • HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-display font-black ${tx.pcu_amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                    {tx.pcu_amount > 0 ? `+${tx.pcu_amount}` : tx.pcu_amount} <span className="text-[10px] font-normal opacity-50">PCU</span>
                  </p>
                  <p className="text-[9px] text-white/20 uppercase font-black tracking-widest">{tx.id.slice(0, 8)}</p>
                </div>
              </div>
            ))}
            {(!txs || txs.length === 0) && (
              <div className="p-20 text-center text-white/20 italic">No transactions recorded yet.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
