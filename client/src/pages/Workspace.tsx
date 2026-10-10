import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LogOut, RefreshCw, Send } from 'lucide-react';
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

export default function Workspace() {
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
  const [verificationTarget, setVerificationTarget] = useState<{ situationId: string; workItemId: string } | null>(null);
  const [verificationEvidence, setVerificationEvidence] = useState('');
  const [verificationBusy, setVerificationBusy] = useState(false);
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
    setVerificationTarget({ situationId: situation.id, workItemId: work.id });
    setVerificationEvidence('');
  };

  const submitVerification = async (event: FormEvent) => {
    event.preventDefault();
    if (!verificationTarget || !verificationEvidence.trim()) return;
    setVerificationBusy(true);
    try {
      await createVerification({
        situationId: verificationTarget.situationId,
        workItemId: verificationTarget.workItemId,
        verificationType: 'OPERATOR_CONFIRMATION',
        status: 'PARTIAL',
        result: { evidenceStatement: verificationEvidence.trim(), source: 'web_workspace', resolutionEffect: 'none' },
      });
      toast.success('Evidence statement recorded; situation remains unresolved');
      setVerificationTarget(null);
      setVerificationEvidence('');
      await loadQueue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record verification');
    } finally { setVerificationBusy(false); }
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
        actionType: 'INVESTIGATE',
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

    if (action.status === 'EXECUTING' && latestAttempt?.status === 'SUCCEEDED') {
      await runAction(action, () => transitionAction(action.id, 'SUCCEEDED'));
    }
  };

  const actionButton = (action: OperationalAction) => {
    const busyForAction = actionBusy === action.id;

    if (action.status === 'PROPOSED' && permissions.includes('action.authorize')) {
      return (
        <button disabled={busyForAction} onClick={() => void runAction(action, () => authorizeAction(action.id))}
          className="rounded-lg border border-[#d8e5bd] px-3 py-2 text-xs text-[#607b31] hover:bg-[#f5f8ef] disabled:opacity-50">
          {busyForAction ? 'Authorizing…' : 'Authorize'}
        </button>
      );
    }

    if (['AUTHORIZED', 'EXECUTING'].includes(action.status) && permissions.includes('work.execute')) {
      const attempt = action.attempts[action.attempts.length - 1];
      let label = 'Start execution';
      if (action.status === 'EXECUTING' && !attempt) label = 'Create attempt';
      else if (attempt?.status === 'CREATED') label = 'Start attempt';
      else if (attempt?.status === 'EXECUTING') label = 'Evidence required';
      else if (attempt?.status === 'SUCCEEDED') label = 'Complete action';

      if (action.status === 'EXECUTING' && attempt?.status === 'EXECUTING') {
        return <span className="text-xs text-[var(--color-ink-muted)]">Awaiting recorded execution evidence</span>;
      }

      return (
        <button disabled={busyForAction} onClick={() => void executeAction(action)}
          className="rounded-lg border border-[#d8e6ed] px-3 py-2 text-xs text-[#456a7c] hover:bg-[#eff6f8] disabled:opacity-50">
          {busyForAction ? 'Updating…' : label}
        </button>
      );
    }

    return null;
  };

  return (
    <main className="min-h-screen el-shell">
      <header className="border-b border-[#e3e7e2] bg-white px-4 py-4 sm:px-6 sm:py-5">
        <div className="el-container flex items-center justify-between">
          <div className="flex items-center gap-3"><span className="text-sm font-bold tracking-[.12em]">ENERLECTRA</span></div>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-[#68716b] hover:text-[#202521]"><LogOut size={16} /> Sign out</button>
        </div>
      </header>

      <section className="el-container py-7 sm:py-10">
        <OperatingContextPanel />
        <ResourceContextPanel onContextChange={(next) => setContextSelection((current) => ({ ...current, ...next }))} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[#607b31]">Operational intelligence</p>
            <h1 className="mt-3 text-3xl font-semibold">See what needs attention</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#68716b]">
              Enerlectra turns operational evidence into situations, recommendations, work, actions and verified outcomes.
            </p>
          </div>
          <button onClick={() => void loadQueue()} disabled={queueBusy} className="flex items-center gap-2 rounded-xl border border-[#e3e7e2] px-4 py-2 text-sm text-[#454d47] hover:bg-[#f1f4ee] disabled:opacity-50">
            <RefreshCw size={16} className={queueBusy ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ['Open', queueMetrics.openSituations],
            ['Critical', queueMetrics.criticalSituations],
            ['High priority', queueMetrics.highPriorityWork],
            ['Unassigned', queueMetrics.unassignedWork],
            ['Overdue', queueMetrics.overdueWork],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[#e3e7e2] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(32,37,33,0.03)]">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#7b847c]">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#202521]">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(320px,.8fr)_minmax(0,1.2fr)]">
          <form onSubmit={submit} className="rounded-2xl border border-[#e3e7e2] bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-[#607b31]" />
              <h2 className="font-medium">Report an operational issue</h2>
            </div>
            <label className="mt-6 block text-sm text-[#454d47]">Issue title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-2 w-full rounded-xl border border-[#e3e7e2] bg-[#fafbf8] px-4 py-3 outline-none focus:border-[#8ba64d]" />
            </label>
            <label className="mt-4 block text-sm text-[#454d47]">What happened?
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} required rows={5} className="mt-2 w-full rounded-xl border border-[#e3e7e2] bg-[#fafbf8] px-4 py-3 outline-none focus:border-[#8ba64d]" />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-[#454d47]">Severity
                <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="mt-2 w-full rounded-xl border border-[#e3e7e2] bg-[#fafbf8] px-4 py-3">
                  <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
                </select>
              </label>
              <label className="text-sm text-[#454d47]">Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="mt-2 w-full rounded-xl border border-[#e3e7e2] bg-[#fafbf8] px-4 py-3">
                  <option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option>
                </select>
              </label>
            </div>
            <button disabled={busy} className="mt-6 flex items-center gap-2 rounded-xl bg-[#c8f169] px-5 py-3 font-medium text-[#253019] disabled:opacity-50">
              {busy ? 'Creating…' : <><Send size={17} /> Create operational issue</>}
            </button>
            {result && <div className="mt-4 flex gap-3 rounded-xl border border-[#d9e8d9] bg-[#f2f8f1] p-4 text-sm text-[#3f6d45]"><CheckCircle2 size={18} />{result}</div>}
            {verificationTarget && <form onSubmit={submitVerification} className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-4">
              <h3 className="text-sm font-semibold">Record verification evidence</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-ink-muted)]">Record the evidence statement or observation you have. This is stored as partial evidence and will not resolve the situation; verified resolution requires a linked observation or event.</p>
              <textarea value={verificationEvidence} onChange={(event) => setVerificationEvidence(event.target.value)} required minLength={8} rows={4} className="el-input mt-3" placeholder="Describe the evidence observed…" />
              <div className="mt-3 flex gap-2"><button disabled={verificationBusy} className="el-button-primary">{verificationBusy ? 'Recording…' : 'Record evidence'}</button><button type="button" onClick={() => setVerificationTarget(null)} className="el-button-secondary">Cancel</button></div>
            </form>}
          </form>

          <section className="rounded-2xl border border-[#e3e7e2] bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Operational queue</h2>
                <p className="mt-1 text-xs text-[#7b847c]">Situation → recommendation → work → action → verification</p>
              </div>
              <span className="rounded-full border border-[#e3e7e2] px-3 py-1 text-xs text-[#68716b]">{queue.length}</span>
            </div>

            {queueBusy ? (
              <div className="py-14 text-center text-sm text-[#7b847c]">Loading operational picture…</div>
            ) : queue.length === 0 ? (
              <div className="py-14 text-center text-sm text-[#7b847c]">No unresolved situations.</div>
            ) : (
              <div className="mt-5 space-y-3">
                {queue.map((situation) => {
                  const recommendation = situation.recommendations[0];
                  const work = situation.workItems[0];
                  return (
                    <article key={situation.id} className="rounded-xl border border-[#e3e7e2] bg-[#f7f8f5] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{situation.title}</span>
                            <span className="rounded-full border border-[#e3e7e2] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#68716b]">{situation.severity}</span>
                            <span className="rounded-full border border-[#e3e7e2] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#7b847c]">{situation.status}</span>
                          </div>
                          {situation.summary && <p className="mt-2 text-sm leading-5 text-[#68716b]">{situation.summary}</p>}
                        </div>
                        {work && <button onClick={() => verify(situation)} className="shrink-0 rounded-lg border border-[#d9e8d9] px-3 py-2 text-xs text-[#3f6d45] hover:bg-[#f2f8f1]">Record evidence</button>}
                      </div>

                      {recommendation && (
                        <div className="mt-4 rounded-lg border border-[#e3e7e2] bg-[#f5f8ef] p-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#607b31]/70">Recommended next step</p>
                          <p className="mt-1 text-sm text-[#454d47]">{recommendation.summary}</p>
                        </div>
                      )}

                      {work && (
                        <div className="mt-3 rounded-lg border border-[#e3e7e2] bg-[#fafbf8] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#7b847c]">
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
                                className="rounded-lg border border-[#e3e7e2] px-3 py-2 text-xs text-[#454d47] hover:bg-[#f1f4ee] disabled:opacity-50"
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
                                  <div key={action.id} className="rounded-lg border border-[#e3e7e2] bg-[#f7f8f5] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <p className="text-xs font-medium text-[#454d47]">{action.action_type}</p>
                                        <p className="mt-1 text-[10px] uppercase tracking-wide text-[#7b847c]">
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