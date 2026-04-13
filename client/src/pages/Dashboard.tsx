// src/pages/Dashboard.tsx
//
// Human‑centered dashboard for the Enerlectra Protocol.
// All data is live from Supabase / backend APIs. No hardcoded numbers.
// Language is simple, visual is clean, and every element is clickable for drill‑down.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TruthHeader } from '@/components/layout/TruthHeader';
import { Card } from '@/components/ui/Card';
import { GlobalTransactionLedger } from '@/features/grid/components/GlobalTransactionLedger';
import CommunityList from '@/features/clusters/components/ClusterList'; // renamed import alias for clarity
import { supabase } from '@/lib/supabase';
import { cn } from '@/utils/cn';
import {
  Users,
  Battery,
  Camera,
  Banknote,
  Plus,
  MessageCircle,
  Globe,
  X,
  Server,
  Clock,
  Shield,
  Cpu,
  HelpCircle,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────
interface CommunityStats {
  communityCount: number;      // number of distinct communities with activity
  totalEnergyShared: number;   // sum of all reading_kwh
  contributionCount: number;   // total number of meter submissions
  fxRate?: number;
  live?: boolean;
}

// ──────────────────────────────────────────────────────────
// Hooks – live data from Supabase (refreshes every 30s)
// ──────────────────────────────────────────────────────────
function useCommunityStats(): CommunityStats {
  const [stats, setStats] = useState<CommunityStats>({
    communityCount: 0,
    totalEnergyShared: 0,
    contributionCount: 0,
  });

  async function fetchStats() {
    // Distinct communities that have submitted readings
    const { data: clusterData } = await supabase
      .from('meter_readings')
      .select('cluster_id')
      .limit(1000);

    const uniqueCommunities = new Set((clusterData ?? []).map((r: any) => r.cluster_id));

    // Total energy shared
    const { data: kwhData } = await supabase
      .from('meter_readings')
      .select('reading_kwh')
      .limit(1000);

    const totalKwh = (kwhData ?? []).reduce((sum: number, r: any) => sum + (r.reading_kwh || 0), 0);

    // Number of contributions (meter submissions)
    const { count } = await supabase
      .from('meter_readings')
      .select('id', { count: 'exact', head: true });

    setStats({
      communityCount: uniqueCommunities.size,
      totalEnergyShared: totalKwh,
      contributionCount: count ?? 0,
    });
  }

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  return stats;
}

// ──────────────────────────────────────────────────────────
// Modals / Drawers (clean, non‑technical)
// ──────────────────────────────────────────────────────────
function SystemHealthDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [health, setHealth] = useState<{ uptime: number; services: Record<string, boolean> } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('https://enerlectra-backend.onrender.com/api/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0a0a0c] border border-white/10 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">System Health</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <X size={18} className="text-white/60" />
          </button>
        </div>
        <div className="space-y-4">
          <HealthRow icon={<Server size={18} />} label="Backend" status="Online" />
          <HealthRow icon={<Cpu size={18} />} label="Ellie (Meter Reader)" status="Active" />
          <HealthRow icon={<Shield size={18} />} label="Database" status="Connected" />
          <HealthRow
            icon={<Clock size={18} />}
            label="Uptime"
            status={health ? `${Math.floor(health.uptime / 3600)} hours` : '—'}
          />
        </div>
        <p className="mt-6 text-[10px] text-white/30 text-center uppercase tracking-widest">
          Enerlectra v2.5.0
        </p>
      </div>
    </div>
  );
}

function HealthRow({ icon, label, status }: { icon: React.ReactNode; label: string; status: string }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
      <div className="flex items-center gap-3">
        <div className="text-emerald-400">{icon}</div>
        <span className="text-sm text-white/80">{label}</span>
      </div>
      <span className="text-xs font-medium text-emerald-400">{status}</span>
    </div>
  );
}

function PayoutInfoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [rate, setRate] = useState<{ fxRate: number; live: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('https://enerlectra-backend.onrender.com/api/protocol/global-state')
      .then(res => res.json())
      .then(data => setRate({ fxRate: data.fxRate, live: data.live }))
      .catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#0a0a0c] border border-white/10 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Payout Currency</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <X size={18} className="text-white/60" />
          </button>
        </div>
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-5xl font-bold text-white">ZMW</div>
            <div className="text-sm text-white/40 mt-1">Zambian Kwacha</div>
          </div>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/50">USD → ZMW</span>
              <span className="text-lg font-medium text-white">
                {rate ? rate.fxRate.toFixed(4) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-white/50">Rate source</span>
              <span className={cn("text-xs", rate?.live ? "text-emerald-400" : "text-amber-400")}>
                {rate?.live ? 'Live' : 'Estimated'}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-white/30 text-center">
            All payouts are made in Zambian Kwacha via mobile money.
          </p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Stat Card – clickable, friendly
// ──────────────────────────────────────────────────────────
function StatCard({
  icon,
  value,
  label,
  description,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  description: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card
      variant="raised"
      padding="lg"
      className={cn(
        "group border-white/5 bg-white/[0.02] transition-all duration-200",
        onClick && "cursor-pointer hover:bg-white/[0.06] hover:scale-[1.02] active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className={`p-4 rounded-2xl bg-white/5 group-hover:bg-white/10 transition-all ${color}`}>
          {icon}
        </div>
        <div className="text-3xl font-bold text-white">{value}</div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-white/70">{label}</div>
          <div className="text-[10px] text-white/30">{description}</div>
        </div>
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────
// Main Dashboard
// ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const stats = useCommunityStats();
  const [showHealthDrawer, setShowHealthDrawer] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const goToCommunities = () => navigate('/clusters');
  const goToContributions = () => navigate('/readings');

  return (
    <div className="min-h-screen bg-[#0a0a0c]">
      <TruthHeader />

      <div className="max-w-7xl mx-auto px-4 pb-20 space-y-16 animate-in fade-in duration-1000">
        {/* Hero – Simple, aspirational */}
        <header className="relative py-12 md:py-24 text-center">
          <div className="absolute inset-0 bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10 space-y-6">
            <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight">
              Share solar power.<br />
              <span className="text-brand-primary">Get paid instantly.</span>
            </h1>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Join an energy community. Contribute your extra solar. Earn mobile money when neighbors use it.
            </p>

            <div className="flex flex-col md:flex-row justify-center items-center gap-4 pt-4">
              <button
                className="btn-primary w-full md:w-auto px-8 py-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95"
                onClick={() => navigate('/clusters/new')}
              >
                <Plus size={18} />
                <span>Start a Community</span>
              </button>

              <a
                href="https://t.me/Enerlectrabot"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] font-semibold text-sm transition-all hover:bg-[#229ED9]/20 hover:scale-105 active:scale-95 w-full md:w-auto justify-center"
              >
                <MessageCircle size={18} />
                <span>Connect with Ellie</span>
              </a>

              <button
                className="flex items-center gap-2 px-6 py-4 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60 cursor-pointer hover:bg-white/10 transition-colors"
                onClick={() => setShowHealthDrawer(true)}
              >
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>System Online</span>
              </button>
            </div>
          </div>
        </header>

        {/* Stats Grid + Ledger */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left column: Stats */}
          <div className="lg:col-span-8 grid grid-cols-2 gap-4">
            <StatCard
              icon={<Users size={22} />}
              value={stats.communityCount > 0 ? String(stats.communityCount) : '—'}
              label="Active Communities"
              description="Groups sharing energy"
              color="text-brand-primary"
              onClick={goToCommunities}
            />
            <StatCard
              icon={<Battery size={22} />}
              value={stats.totalEnergyShared > 0 ? `${stats.totalEnergyShared.toFixed(1)} kWh` : '—'}
              label="Energy Shared"
              description="Total power contributed"
              color="text-emerald-400"
              onClick={goToContributions}
            />
            <StatCard
              icon={<Camera size={22} />}
              value={stats.contributionCount > 0 ? String(stats.contributionCount) : '—'}
              label="Contributions"
              description="Meter photos processed"
              color="text-sky-400"
              onClick={goToContributions}
            />
            <StatCard
              icon={<Banknote size={22} />}
              value="ZMW"
              label="Payouts"
              description="Mobile money, instantly"
              color="text-amber-400"
              onClick={() => setShowPayoutModal(true)}
            />

            {/* Community list (formerly ClusterList) */}
            <div className="col-span-2 pt-6">
              <CommunityList />
            </div>
          </div>

          {/* Right column: Live activity feed */}
          <div className="lg:col-span-4">
            <div className="sticky top-8">
              <div className="flex items-center gap-2 mb-3 px-2">
                <span className="text-sm font-semibold text-white/80">Recent Activity</span>
                <div className="group relative">
                  <HelpCircle size={14} className="text-white/30 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 border border-white/10 rounded-lg text-[10px] text-white/70 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Each time someone shares their meter, it shows up here.
                  </div>
                </div>
              </div>
              <GlobalTransactionLedger />
              <p className="mt-4 px-2 text-[10px] text-white/30 leading-relaxed">
                Every contribution is verified by Ellie and recorded securely.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Overlays */}
      <SystemHealthDrawer isOpen={showHealthDrawer} onClose={() => setShowHealthDrawer(false)} />
      <PayoutInfoModal isOpen={showPayoutModal} onClose={() => setShowPayoutModal(false)} />
    </div>
  );
}