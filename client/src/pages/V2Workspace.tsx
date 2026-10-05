import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LogOut, RefreshCw, Send, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { supabaseV2 } from '@/lib/supabase-v2';
import { createOperationalIssue, createVerification, getOperationalQueue, type OperationalQueueItem } from '@/lib/v2-api';
import OperatingContextPanel from '@/components/OperatingContextPanel';
import ResourceContextPanel from '@/components/ResourceContextPanel';

export default function V2Workspace() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [busy, setBusy] = useState(false);
  const [queueBusy, setQueueBusy] = useState(true);
  const [queue, setQueue] = useState<OperationalQueueItem[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const loadQueue = async () => {
    setQueueBusy(true);
    try {
      const response = await getOperationalQueue();
      setQueue(response.situations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load operational queue');
    } finally {
      setQueueBusy(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  const signOut = async () => {
    await supabaseV2.auth.signOut();
    navigate('/signin', { replace: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await createOperationalIssue({
        title,
        summary,
        severity,
        priority,
        workType: 'INVESTIGATE',
        observationType: 'CUSTOMER_REPORT',
        observationValue: { summary, source: 'web_workspace' },
        source: 'WEB',
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(`Situation created; work item is now visible in the operational queue. Situation ${response.situationId}.`);
      setTitle('');
      setSummary('');
      toast.success('Operational issue created');
      await loadQueue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create issue');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (situation: OperationalQueueItem) => {
    const work = situation.workItems[0];
    if (!work) return;
    const summary = window.prompt('What evidence confirms the outcome?');
    if (!summary?.trim()) return;

    try {
      await createVerification({
        situationId: situation.id,
        workItemId: work.id,
        verificationType: 'OPERATOR_CONFIRMATION',
        status: 'VERIFIED',
        result: { summary: summary.trim(), source: 'web_workspace' },
      });
      toast.success('Outcome verified');
      await loadQueue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not verify outcome');
    }
  };

  return (
    <main className="min-h-screen bg-[#020205] text-slate-100">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3"><Zap className="text-amber-400" size={22} /><span className="font-semibold tracking-wide">ENERLECTRA</span></div>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"><LogOut size={16} /> Sign out</button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <OperatingContextPanel />
        <ResourceContextPanel />
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Operational intelligence</p>
            <h1 className="mt-3 text-3xl font-semibold">See what needs attention</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Enerlectra turns operational evidence into situations, recommendations, work and verified outcomes. The queue below is the current operational picture for your organization.
            </p>
          </div>
          <button onClick={() => void loadQueue()} disabled={queueBusy} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={16} className={queueBusy ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_1.4fr]">
          <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-300" />
              <h2 className="font-medium">Report an operational issue</h2>
            </div>
            <label className="mt-6 block text-sm text-slate-300">Issue title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50" />
            </label>
            <label className="mt-4 block text-sm text-slate-300">What happened?
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} required rows={5} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50" />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Severity
                <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
                </select>
              </label>
              <label className="text-sm text-slate-300">Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option>
                </select>
              </label>
            </div>
            <button disabled={busy} className="mt-6 flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-medium text-black disabled:opacity-50">
              {busy ? 'Creating…' : <><Send size={17} /> Create operational issue</>}
            </button>
            {result && <div className="mt-4 flex gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-200"><CheckCircle2 size={18} />{result}</div>}
          </form>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Operational queue</h2>
                <p className="mt-1 text-xs text-slate-500">Open and investigating situations</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">{queue.length}</span>
            </div>

            {queueBusy ? (
              <div className="py-14 text-center text-sm text-slate-500">Loading operational picture…</div>
            ) : queue.length === 0 ? (
              <div className="py-14 text-center text-sm text-slate-500">No unresolved situations.</div>
            ) : (
              <div className="mt-5 space-y-3">
                {queue.map((situation) => {
                  const recommendation = situation.recommendations[0];
                  const work = situation.workItems[0];
                  return (
                    <article key={situation.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{situation.title}</span>
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">{situation.severity}</span>
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">{situation.status}</span>
                          </div>
                          {situation.summary && <p className="mt-2 text-sm leading-5 text-slate-400">{situation.summary}</p>}
                        </div>
                        {work && <button onClick={() => void verify(situation)} className="shrink-0 rounded-lg border border-emerald-400/20 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-400/5">Verify outcome</button>}
                      </div>
                      {recommendation && (
                        <div className="mt-4 rounded-lg border border-amber-300/10 bg-amber-300/[0.04] p-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300/70">Recommended next step</p>
                          <p className="mt-1 text-sm text-slate-300">{recommendation.summary}</p>
                        </div>
                      )}
                      {work && (
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>Work: {work.status}</span>
                          <span>Type: {work.work_type}</span>
                          <span>Priority: {work.priority}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
