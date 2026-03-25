import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Zap, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LaunchClusterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    target_kw: '',
    target_usd: '',
    location: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleDeploy = async () => {
    if (!form.name || !form.target_kw || !form.target_usd || !form.location) {
      toast.error('Please complete all fields');
      return;
    }
    if (!user) {
      toast.error('You must be signed in');
      return;
    }
    setLoading(true);
    try {
      const id = `clu_${Math.random().toString(36).slice(2, 10)}`;
      const { error } = await supabase.from('clusters').insert({
        id,
        name: form.name,
        target_kw: Number(form.target_kw),
        target_usd: Number(form.target_usd),
        location: form.location,
        lifecycle_state: 'fundraising',
        current_usd: 0,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success('Cluster deployed to the Enerlectra network!');
      navigate(`/clusters/${id}`);
    } catch (err: any) {
      toast.error(err.message || 'Deployment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-display font-black tracking-tighter">Launch a New Node</h1>
        <p className="text-white/50 mt-2 max-w-xl">Deploy a community solar cluster. Set your capacity, funding goal, and open it to co-ownership.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass p-8 rounded-2xl space-y-6">
          <h3 className="text-lg font-bold text-white/80 uppercase tracking-widest text-sm">Cluster Configuration</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Cluster Name</label>
              <input name="name" value={form.name} onChange={handleChange}
                placeholder="e.g. Kabwe North Hub"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Target Capacity (kW)</label>
              <input name="target_kw" value={form.target_kw} onChange={handleChange}
                type="number" placeholder="50"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Funding Target (USD)</label>
              <input name="target_usd" value={form.target_usd} onChange={handleChange}
                type="number" placeholder="5000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Location</label>
              <input name="location" value={form.location} onChange={handleChange}
                placeholder="Kabwe, Central Province"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary outline-none transition-all" />
            </div>
          </div>

          <button onClick={handleDeploy} disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-xl text-white font-bold text-sm uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Deploying...' : 'Deploy to Enerlectra Network'}
          </button>
        </div>

        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border-l-4 border-brand-primary">
            <Shield className="text-brand-primary mb-3" size={28} />
            <h4 className="font-bold mb-1">Immutable Ownership</h4>
            <p className="text-sm text-white/40">Ownership stakes are mathematically locked to the cluster energy output the moment a contribution is recorded.</p>
          </div>
          <div className="glass p-6 rounded-2xl border-l-4 border-emerald-500">
            <Zap className="text-emerald-400 mb-3" size={28} />
            <h4 className="font-bold mb-1">Yield Auto-Sim</h4>
            <p className="text-sm text-white/40">PCU distribution begins automatically on the first meter reading submitted via the grid.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
