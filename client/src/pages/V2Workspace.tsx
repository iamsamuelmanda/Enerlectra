import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LogOut, RefreshCw, Send, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  authorizeAction,
  createAction,
  createActionAttempt,
  createOperationalIssue,
  createVerification,
  getOperationalQueue,
  transitionAction,
  transitionActionAttempt,
  type OperationalAction,
  type OperationalQueueItem,
} from '@/lib/operational-api';
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
  const [permissions, setPermissions] = useState<string[]>([]);
  const [queueMetrics, setQueueMetrics] = useState({
    openSituations: 0,
    criticalSituations: 0,
    highPriorityWork: 0,
    unassignedWork: 0,
    overdueWork: 0,
    oldestOpenAt: null as string | null,
  });
  const [result, setResult] = useState<string | null>(null);
  const [contextSelection, setContextSelection] = useState<{ customerId?: string; siteId?: string; assetId?: string }>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadQueue = async () => {
    setQueueBusy(true);
    try {
      const response = await getOperationalQueue();
      setQueue(response.situations);
      setQueueMetrics(response.metrics);
      setPermissions(response.permissions);
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
    await supabase.auth.signOut();
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
        customerId: contextSelection.customerId,
        siteId: contextSelection.siteId,
        assetId: contextSelection.assetId,
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(`Situation created; work item is now visible in the operational queue. Situation ${response.situationId}.`);
      setTitle('');
      setSummary('');
      setContextSelection({});
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

  const runAction = async (action: OperationalAction, operation: () => Promise<unknown>) => {
    setActionBusy(action.id);
    try {
      await operation();
      toast.success('Action lifecycle updated');
      await loadQueue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update action');
    } finally {
      setActionBusy(null);
    }
  };

  const proposeAction = async (workItemId: string, target: Record<string, unknown> = {}) => {
    setActionBusy(workItemId);
    try {
      await createAction({
        workItemId,
        actionType: 'PERFORM_FIELD_CHECK',
        consequenceClass: 'OPERATIONAL',
        target,
        metadata: { source: 'web_workspace' },
      });
      toast.success('Action proposed');
      await loadQueue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not propose action');
    } finally {
      setActionBusy(null);
    }
  };

  const executeAction = async (action: OperationalAction) => {
    const latestAttempt = action.attempts[action.attempts.length - 1];

    if (action.status === 'AUTHORIZED') {
      await runAction(action, () => transitionAction(action.id, 'EXECUTING'));
      return;
    }

    if (action.status === 'EXECUTING' && !latestAttempt) {
      await runAction(action, () => createActionAttempt(action.id, 1));
      return;
    }

    if (action.status === 'EXECUTING' && latestAttempt?.status === 'CREATED') {
      await runAction(action, () => transitionActionAttempt(action.id, latestAttempt.id, 'EXECUTING'));
      return;
    }

    if (action.status === 'EXECUTING' && latestAttempt?.status === 'EXECUTING') {
      await runAction(action, () => transitionActionAttempt(action.id, latestAttempt.id, 'SUCCEEDED', {
        resultCode: 'FIELD_CHECK_COMPLETE',
        resultSummary: 'Completed from the Enerlectra operational workspace.',
      }));
      return;
    }

    if (action.status === 'EXECUTING' && latestAttempt?.status === 'SUCCEEDED') {
      await runAction(action, () => transitionAction(action.id, 'SUCCEEDED'));
    }
  };

  const actionButton = (action: OperationalAction) => {
    const busyForAction = actionBusy === action.id;

    if (action.status === 'PROPOSED' && permissions.includes('action.authorize')) {
      return (
        <button disabled={busyForAction} onClick={() => void runAction(action, () => authorizeAction(action.id))}
          className="rounded-lg border border-amber-300/20 px-3 py-2 text-xs text-amber-200 hover:bg-amber-300/5 disabled:opacity-50">
          {busyForAction ? 'Authorizing…' : 'Authorize'}
        </button>
      );
    }

    if (['AUTHORIZED', 'EXECUTING'].includes(action.status) && permissions.includes('work.execute')) {
      const attempt = action.attempts[action.attempts.length - 1];
      let label = 'Start execution';
      if (action.status === 'EXECUTING' && !attempt) label = 'Create attempt';
      else if (attempt?.status === 'CREATED') label = 'Start attempt';
      else if (attempt?.status === 'EXECUTING') label = 'Complete attempt';
      else if (attempt?.status === 'SUCCEEDED') label = 'Complete action';

      return (
        <button disabled={busyForAction} onClick={() => void executeAction(action)}
          className="rounded-lg border border-sky-300/20 px-3 py-2 text-xs text-sky-200 hover:bg-sky-300/5 disabled:opacity-50">
          {busyForAction ? 'Updating…' : label}
        </button>
      );
    }

    return null;
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
        <ResourceContextPanel onContextChange={(next) => setContextSelection((current) => ({ ...current, ...next }))} />
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Operational intelligence</p>
            <h1 className="mt-3 text-3xl font-semibold">See what needs attention</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Enerlectra turns operational evidence into situations, recommendations, work, actions and verified outcomes.
            </p>
          </div>
          <button onClick={() => void loadQueue()} disabled={queueBusy} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={16} className={queueBusy ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ['Open', queueMetrics.openSituations],
            ['Critical', queueMetrics.criticalSituations],
            ['High priority', queueMetrics.highPriorityWork],
            ['Unassigned', queueMetrics.unassignedWork],
            ['Overdue', queueMetrics.overdueWork],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
            </div>
          ))}
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
                <p className="mt-1 text-xs text-slate-500">Situation → recommendation → work → action → verification</p>
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
                        <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                            <div className="flex flex-wrap gap-3">
                              <span>Work: {work.status}</span>
                              <span>Type: {work.work_type}</span>
                              <span>Priority: {work.priority}</span>
                            </div>
                            {permissions.includes('action.create') && (
                              <button
                                disabled={actionBusy === work.id}
                                onClick={() => void proposeAction(work.id, {
                                  ...(situation.customer_id ? { customerId: situation.customer_id } : {}),
                                  ...(situation.site_id ? { siteId: situation.site_id } : {}),
                                  ...(situation.asset_id ? { assetId: situation.asset_id } : {}),
                                })}
                                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                              >
                                {actionBusy === work.id ? 'Proposing…' : 'Propose action'}
                              </button>
                            )}
                          </div>

                          {work.actions.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {work.actions.map((action) => {
                                const latestAttempt = action.attempts[action.attempts.length - 1];
                                return (
                                  <div key={action.id} className="rounded-lg border border-white/5 bg-black/20 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <p className="text-xs font-medium text-slate-300">{action.action_type}</p>
                                        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                                          {action.consequence_class} · {action.status}
                                          {latestAttempt ? ` · attempt ${latestAttempt.attempt_number}: ${latestAttempt.status}` : ''}
                                        </p>
                                      </div>
                                      {actionButton(action)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
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