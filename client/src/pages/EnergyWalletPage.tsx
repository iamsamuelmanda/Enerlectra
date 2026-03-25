import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserAssets } from '@/hooks/useUserAssets';
import { Wallet, Zap, PieChart, Shield, Ticket, X, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function EnergyWalletPage() {
  const navigate = useNavigate();
  const { data: assets, isLoading, redeem } = useUserAssets();
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState(0);
  const [voucher, setVoucher] = useState<string | null>(null);

  const handleRedeem = async () => {
    if (redeemAmount <= 0 || redeemAmount > (assets?.totalPcu || 0)) return;
    const result = await redeem.mutateAsync(redeemAmount);
    setVoucher(result.voucher_code);
  };

  if (isLoading) return <div className="min-h-[60vh] flex items-center justify-center animate-pulse text-white/20 font-black">SYNCING GRID...</div>;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-black tracking-tighter uppercase italic">Energy Wallet</h1>
          <p className="text-white/50 mt-2">Manage distributed ownership and power credits.</p>
        </div>
        <button onClick={() => setShowRedeem(true)} className="btn-primary px-6 py-3 flex items-center gap-2">
          <Ticket size={18} /> Redeem PCU
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="glass" padding="lg" className="border-l-4 border-brand-primary">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4">Available PCU</p>
          <h2 className="text-4xl font-display font-black text-white">{assets?.totalPcu.toLocaleString()}</h2>
        </Card>
        <Card variant="glass" padding="lg" className="border-l-4 border-emerald-500">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4">Portfolio Value</p>
          <h2 className="text-4xl font-display font-black text-white">${assets?.totalContribution.toLocaleString()}</h2>
        </Card>
        <Card variant="glass" padding="lg" className="border-l-4 border-purple-500">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4">Grid Nodes</p>
          <h2 className="text-4xl font-display font-black text-white">{assets?.nodeCount}</h2>
        </Card>
      </div>

      {/* STAKES TABLE */}
      <Card variant="glass" className="overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-white/[0.02] border-b border-white/5">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Node</th>
              <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-right">Stake %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {assets?.stakes.map((stake: any) => (
              <tr key={stake.cluster_id} className="hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => navigate(`/clusters/${stake.cluster_id}`)}>
                <td className="px-6 py-4 font-bold">{stake.clusters?.name}</td>
                <td className="px-6 py-4 text-right text-brand-primary font-black">{(stake.ownership_share * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* REDEEM MODAL */}
      {showRedeem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <Card className="max-w-md w-full p-8 border border-white/10 relative">
            <button onClick={() => { setShowRedeem(false); setVoucher(null); }} className="absolute top-4 right-4 text-white/20 hover:text-white"><X /></button>
            
            {!voucher ? (
              <div className="space-y-6">
                <h3 className="text-2xl font-black uppercase italic">Redeem Credits</h3>
                <p className="text-sm text-white/40">Convert your PCU into a utility meter voucher. 1 PCU ≈ 1 kWh.</p>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-brand-primary">Amount to Redeem</label>
                  <input type="number" value={redeemAmount} onChange={(e) => setRedeemAmount(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-brand-primary transition-all" />
                </div>
                <button onClick={handleRedeem} disabled={redeem.isPending || redeemAmount <= 0} className="w-full py-4 bg-brand-primary rounded-xl font-bold uppercase flex items-center justify-center gap-2">
                  {redeem.isPending && <Loader2 className="animate-spin" />}
                  Generate Voucher
                </button>
              </div>
            ) : (
              <div className="text-center space-y-6 py-4">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto"><Ticket size={32} /></div>
                <h3 className="text-2xl font-black uppercase italic">Voucher Ready</h3>
                <div className="bg-white/5 p-6 rounded-2xl border border-dashed border-white/20">
                  <span className="text-3xl font-mono font-black tracking-widest text-brand-primary">{voucher}</span>
                </div>
                <p className="text-xs text-white/40 uppercase font-bold">Enter this code into your prepaid meter</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
