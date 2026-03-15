# ============================================================
#  Enerlectra Client – Scaffold Missing Files & Folders
#  Run from your project root (where /client lives):
#    .\scaffold-enerlectra.ps1
#  Or pass a custom client path:
#    .\scaffold-enerlectra.ps1 -ClientRoot "C:\path\to\client"
# ============================================================

param(
    [string]$ClientRoot = ".\client"
)

$src = Join-Path $ClientRoot "src"
$created  = @()
$skipped  = @()
$audits   = @()

# ── helpers ──────────────────────────────────────────────────
function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

function Write-File($path, $content) {
    $dir = Split-Path $path -Parent
    Ensure-Dir $dir
    if (Test-Path $path) {
        $script:skipped += $path
    } else {
        Set-Content -Path $path -Value $content -Encoding UTF8
        $script:created += $path
    }
}

function Audit-File($path, $reason) {
    if (Test-Path $path) {
        $script:audits += "$path  →  $reason"
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Enerlectra Client Scaffold" -ForegroundColor Cyan
Write-Host "  Target: $src" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $src)) {
    Write-Host "ERROR: src folder not found at $src" -ForegroundColor Red
    Write-Host "Make sure you're running this from the project root." -ForegroundColor Yellow
    exit 1
}

# ============================================================
#  1. TYPES
# ============================================================

Write-File "$src\types\api.ts" @'
// ─────────────────────────────────────────────────────────────
//  Enerlectra – Shared API Types
//  Single source of truth. Must match backend response shapes.
//  Do NOT put UI-only types here – use the feature type files.
// ─────────────────────────────────────────────────────────────

export interface Cluster {
  id: string;
  name: string;
  location: string;
  capacity_kw: number;
  participant_count: number;
  status: 'active' | 'pending' | 'inactive';
}

export interface Contribution {
  id: string;
  cluster_id: string;
  participant_id: string;
  amount_pcu: number;
  ownership_percent: number;
  created_at: string;
}

export interface EnergyReading {
  id?: string;
  cluster_id: string;
  unit_id: string;           // flat / rooftop identifier
  date: string;              // YYYY-MM-DD
  generation_kwh: number;
  consumption_kwh: number;
  surplus_kwh?: number;      // computed by backend
  recorded_by?: string;      // admin / participant id – audit trail
  created_at?: string;
}

export interface SettlementResult {
  cluster_id: string;
  date: string;
  unit_id: string;
  generation_kwh: number;
  consumption_kwh: number;
  net_kwh: number;           // generation - consumption
  credit_pcu: number;
  debit_pcu: number;
  status: 'pending' | 'settled' | 'disputed';
}

export interface OwnershipEntry {
  participant_id: string;
  display_name: string;
  ownership_percent: number;
  contribution_pcu: number;
}

export interface ApiError {
  error: string;
  code?: string;
}
'@

# ============================================================
#  2. LIB / API BASE
# ============================================================

Write-File "$src\lib\api.ts" @'
// ─────────────────────────────────────────────────────────────
//  Base API client – all fetch calls go through here.
//  Attaches auth header and normalises errors.
//  vercel.json proxies /api/* to Render – never hardcode
//  the Render URL in frontend code.
// ─────────────────────────────────────────────────────────────

import { supabase } from './supabase';

const BASE = '/api';

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const authHeaders = await getAuthHeader();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}
'@

# ============================================================
#  3. ENERGY SERVICES
# ============================================================

Write-File "$src\features\energy\services\energyService.ts" @'
import { apiGet, apiPost } from '../../../lib/api';
import type { EnergyReading } from '../../../types/api';

export const submitReading = (
  reading: Omit<EnergyReading, 'id' | 'surplus_kwh' | 'created_at'>
): Promise<EnergyReading> =>
  apiPost<EnergyReading>('/energy/readings', reading);

export const getReadings = (
  clusterId: string,
  from: string,
  to: string
): Promise<EnergyReading[]> =>
  apiGet<EnergyReading[]>(
    `/energy/readings?cluster_id=${clusterId}&from=${from}&to=${to}`
  );
'@

Write-File "$src\features\energy\services\settlementService.ts" @'
import { apiGet, apiPost } from '../../../lib/api';
import type { SettlementResult } from '../../../types/api';

export const getSettlement = (
  clusterId: string,
  date: string
): Promise<SettlementResult[]> =>
  apiGet<SettlementResult[]>(`/settlement/${clusterId}/${date}`);

export const triggerSettlement = (
  clusterId: string,
  date: string
): Promise<{ job_id: string }> =>
  apiPost<{ job_id: string }>('/settlement/run', { cluster_id: clusterId, date });
'@

Write-File "$src\features\energy\services\ownershipService.ts" @'
import { apiGet } from '../../../lib/api';
import type { OwnershipEntry } from '../../../types/api';

export const getOwnership = (clusterId: string): Promise<OwnershipEntry[]> =>
  apiGet<OwnershipEntry[]>(`/ownership/${clusterId}`);
'@

# ============================================================
#  4. ENERGY HOOKS
# ============================================================

Write-File "$src\features\energy\hooks\useEnergyReadings.ts" @'
import { useState, useEffect } from 'react';
import { getReadings } from '../services/energyService';
import type { EnergyReading } from '../../../types/api';

export function useEnergyReadings(clusterId: string, from: string, to: string) {
  const [readings, setReadings] = useState<EnergyReading[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId || !from || !to) return;
    setLoading(true);
    setError(null);
    getReadings(clusterId, from, to)
      .then(setReadings)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId, from, to]);

  return { readings, loading, error };
}
'@

Write-File "$src\features\energy\hooks\useSettlement.ts" @'
import { useState, useEffect } from 'react';
import { getSettlement } from '../services/settlementService';
import type { SettlementResult } from '../../../types/api';

export function useSettlement(clusterId: string, date: string) {
  const [results, setResults] = useState<SettlementResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId || !date) return;
    setLoading(true);
    setError(null);
    getSettlement(clusterId, date)
      .then(setResults)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId, date]);

  return { results, loading, error };
}
'@

Write-File "$src\features\energy\hooks\useOwnership.ts" @'
import { useState, useEffect } from 'react';
import { getOwnership } from '../services/ownershipService';
import type { OwnershipEntry } from '../../../types/api';

export function useOwnership(clusterId: string) {
  const [ownership, setOwnership] = useState<OwnershipEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) return;
    setLoading(true);
    setError(null);
    getOwnership(clusterId)
      .then(setOwnership)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId]);

  return { ownership, loading, error };
}
'@

# ============================================================
#  5. ENERGY COMPONENTS
# ============================================================

Write-File "$src\features\energy\components\EnergyEntryForm.tsx" @'
// Admin form – POST a manual energy reading to /api/energy/readings
import { useState } from 'react';
import { submitReading } from '../services/energyService';

interface Props {
  clusterId: string;
  onSuccess?: () => void;
}

export function EnergyEntryForm({ clusterId, onSuccess }: Props) {
  const [unitId, setUnitId]           = useState('');
  const [date, setDate]               = useState('');
  const [generation, setGeneration]   = useState('');
  const [consumption, setConsumption] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);

    if (!unitId || !date || !generation || !consumption) {
      setError('All fields are required.');
      return;
    }

    setLoading(true);
    try {
      await submitReading({
        cluster_id: clusterId,
        unit_id: unitId,
        date,
        generation_kwh: parseFloat(generation),
        consumption_kwh: parseFloat(consumption),
      });
      setSuccess(true);
      setUnitId(''); setDate(''); setGeneration(''); setConsumption('');
      onSuccess?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur">
      <h3 className="text-lg font-semibold text-white">Submit Energy Reading</h3>

      {error   && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">Reading saved successfully.</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-white/60 mb-1">Unit ID</label>
          <input value={unitId} onChange={e => setUnitId(e.target.value)}
            placeholder="e.g. FLAT-01"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Generation (kWh)</label>
          <input type="number" value={generation} onChange={e => setGeneration(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Consumption (kWh)</label>
          <input type="number" value={consumption} onChange={e => setConsumption(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      <button onClick={handleSubmit} disabled={loading}
        className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium text-sm transition-colors">
        {loading ? 'Saving...' : 'Save Reading'}
      </button>
    </div>
  );
}
'@

Write-File "$src\features\energy\components\SettlementTrace.tsx" @'
// Displays per-unit settlement breakdown for a given cluster + date
import { useSettlement } from '../hooks/useSettlement';
import type { SettlementResult } from '../../../types/api';

interface Props {
  clusterId: string;
  date: string;
}

const statusColour: Record<SettlementResult['status'], string> = {
  pending:  'text-yellow-400',
  settled:  'text-emerald-400',
  disputed: 'text-red-400',
};

export function SettlementTrace({ clusterId, date }: Props) {
  const { results, loading, error } = useSettlement(clusterId, date);

  if (loading) return <p className="text-white/40 text-sm">Loading settlement…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;
  if (!results.length) return <p className="text-white/40 text-sm">No settlement data for {date}.</p>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
        Settlement – {date}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm text-white/80">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Unit</th>
              <th className="px-4 py-2 text-right">Gen kWh</th>
              <th className="px-4 py-2 text-right">Con kWh</th>
              <th className="px-4 py-2 text-right">Net kWh</th>
              <th className="px-4 py-2 text-right">Credit PCU</th>
              <th className="px-4 py-2 text-right">Debit PCU</th>
              <th className="px-4 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.unit_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-2 font-mono">{r.unit_id}</td>
                <td className="px-4 py-2 text-right">{r.generation_kwh.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">{r.consumption_kwh.toFixed(2)}</td>
                <td className={`px-4 py-2 text-right ${r.net_kwh >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.net_kwh.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right text-emerald-400">{r.credit_pcu.toFixed(4)}</td>
                <td className="px-4 py-2 text-right text-red-400">{r.debit_pcu.toFixed(4)}</td>
                <td className={`px-4 py-2 text-center capitalize ${statusColour[r.status]}`}>
                  {r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
'@

Write-File "$src\features\energy\components\OwnershipBar.tsx" @'
// Visual stake breakdown per cluster participant
import { useOwnership } from '../hooks/useOwnership';

interface Props {
  clusterId: string;
}

const COLOURS = [
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-sky-500', 'bg-indigo-500', 'bg-violet-500',
];

export function OwnershipBar({ clusterId }: Props) {
  const { ownership, loading, error } = useOwnership(clusterId);

  if (loading) return <div className="h-6 rounded-full bg-white/10 animate-pulse" />;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;
  if (!ownership.length) return <p className="text-white/40 text-sm">No ownership data.</p>;

  return (
    <div className="space-y-3">
      <div className="flex rounded-full overflow-hidden h-5 w-full gap-px">
        {ownership.map((entry, i) => (
          <div
            key={entry.participant_id}
            className={`${COLOURS[i % COLOURS.length]} transition-all`}
            style={{ width: `${entry.ownership_percent}%` }}
            title={`${entry.display_name}: ${entry.ownership_percent.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {ownership.map((entry, i) => (
          <div key={entry.participant_id} className="flex items-center gap-1.5 text-xs text-white/70">
            <span className={`w-2.5 h-2.5 rounded-full ${COLOURS[i % COLOURS.length]}`} />
            <span>{entry.display_name}</span>
            <span className="text-white/40">{entry.ownership_percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
'@

# ============================================================
#  6. ADMIN FEATURE
# ============================================================

Write-File "$src\features\admin\pages\PilotDashboard.tsx" @'
// Admin-only pilot dashboard
// Route: /admin/pilot  (add to router.tsx)
import { useState } from 'react';
import { EnergyEntryForm }  from '../../energy/components/EnergyEntryForm';
import { SettlementTrace }  from '../../energy/components/SettlementTrace';
import { OwnershipBar }     from '../../energy/components/OwnershipBar';
import { triggerSettlement } from '../../energy/services/settlementService';

const DEFAULT_CLUSTER = 'CLUSTER-001'; // replace with real cluster id from store/env

export default function PilotDashboard() {
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [clusterId]               = useState(DEFAULT_CLUSTER);
  const [running, setRunning]     = useState(false);
  const [runMsg, setRunMsg]       = useState<string | null>(null);
  const [refresh, setRefresh]     = useState(0);

  const handleTrigger = async () => {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await triggerSettlement(clusterId, date);
      setRunMsg(`Settlement job queued: ${res.job_id}`);
      setRefresh(r => r + 1);
    } catch (e: any) {
      setRunMsg(`Error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Pilot Dashboard</h1>
        <p className="text-white/50 text-sm mt-1">Manual data entry and settlement control</p>
      </div>

      {/* Energy Entry */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-3">
          Submit Reading
        </h2>
        <EnergyEntryForm clusterId={clusterId} onSuccess={() => setRefresh(r => r + 1)} />
      </section>

      {/* Ownership */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-3">
          Cluster Ownership
        </h2>
        <OwnershipBar clusterId={clusterId} />
      </section>

      {/* Settlement */}
      <section className="space-y-4">
        <div className="flex items-end gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-3">
              Settlement
            </h2>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <button onClick={handleTrigger} disabled={running}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {running ? 'Running…' : 'Trigger Settlement'}
          </button>
        </div>
        {runMsg && <p className="text-xs text-white/60">{runMsg}</p>}
        <SettlementTrace key={refresh} clusterId={clusterId} date={date} />
      </section>
    </div>
  );
}
'@

# ============================================================
#  7. AUDIT NOTICES for files that must be manually reviewed
# ============================================================

Audit-File "$src\hooks\useSettlement.ts" `
  "Move/replace with features/energy/hooks/useSettlement.ts – check for any core logic"

Audit-File "$src\services\settlements.ts" `
  "Reconcile with features/energy/services/settlementService.ts – ensure no direct Supabase calls for settlement data"

Audit-File "$src\features\energy\services\energyLedger.ts" `
  "Check if it writes to Supabase directly – if so, migrate writes to POST /api/energy/readings"

Audit-File "$src\features\clusters\services\clusterService.ts" `
  "Point GET calls to /api/clusters instead of Supabase if not already done"

Audit-File "$src\lib\coreAdapter.ts" `
  "DELETE this file – business logic must NOT run in the browser"

Audit-File "$src\store\pilotStore.ts" `
  "DELETE or leave empty – API + hooks are your state, no extra store needed"

Audit-File "$src\hooks\useSettlementEngine.ts" `
  "DELETE this file – settlement runs on the backend only"

# ============================================================
#  8. ROUTER REMINDER (not auto-created – manual edit required)
# ============================================================

# ============================================================
#  REPORT
# ============================================================

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  CREATED ($($created.Count) files)" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
foreach ($f in $created) {
    Write-Host "  ✓  $($f.Replace($src, 'src'))" -ForegroundColor Green
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "  SKIPPED – already exists ($($skipped.Count) files)" -ForegroundColor DarkGray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
foreach ($f in $skipped) {
    Write-Host "  –  $($f.Replace($src, 'src'))" -ForegroundColor DarkGray
}

if ($audits.Count -gt 0) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "  MANUAL AUDIT REQUIRED ($($audits.Count) files)" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    foreach ($a in $audits) {
        Write-Host "  ⚠  $($a.Replace($src, 'src'))" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  MANUAL STEP REQUIRED" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  Add the PilotDashboard route to src\routes\router.tsx:" -ForegroundColor Magenta
Write-Host ""
Write-Host "    import PilotDashboard from '../features/admin/pages/PilotDashboard';" -ForegroundColor White
Write-Host "    { path: '/admin/pilot', element: <PilotDashboard /> }" -ForegroundColor White
Write-Host ""
Write-Host "  Done. Review AUDIT items above before shipping." -ForegroundColor Magenta
Write-Host ""