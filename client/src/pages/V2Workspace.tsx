import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut, Send, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabaseV2 } from '@/lib/supabase-v2';
import { createOperationalIssue } from '@/lib/v2-api';

export default function V2Workspace() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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
        workType: 'CUSTOMER_OPERATIONAL_ISSUE',
        observationType: 'CUSTOMER_REPORT',
        observationValue: { summary, source: 'web_workspace' },
        source: 'WEB',
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(`Situation ${response.situationId} created; work item ${response.workItemId} is ready for operations.`);
      setTitle('');
      setSummary('');
      toast.success('Operational issue created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create issue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#020205] text-slate-100">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3"><Zap className="text-amber-400" size={22} /><span className="font-semibold tracking-wide">ENERLECTRA</span></div>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"><LogOut size={16} /> Sign out</button>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.25em] text-amber-300">V2 operational workspace</p>
        <h1 className="mt-3 text-3xl font-semibold">Capture an operational issue</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          The authenticated tenant boundary resolves your Actor, organization, role and permissions on the server.
          The browser never supplies its own organization identity.
        </p>

        <form onSubmit={submit} className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <label className="block text-sm text-slate-300">Issue title
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
        </form>

        {result && <div className="mt-6 flex max-w-2xl gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-200"><AlertTriangle size={18} />{result}</div>}
      </section>
    </main>
  );
}
