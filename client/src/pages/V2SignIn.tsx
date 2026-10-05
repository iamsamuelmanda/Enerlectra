import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogIn, Loader2, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabaseV2 } from '@/lib/supabase-v2';

export default function V2SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabaseV2.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    navigate('/workspace', { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020205] px-6 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="mb-8 flex items-center gap-3">
          <Zap className="text-amber-400" size={22} />
          <span className="font-semibold tracking-wide">ENERLECTRA</span>
        </div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          V2 pilot access is invitation-only. Your Actor and organization membership must already be provisioned.
        </p>
        <label className="mt-6 block text-sm text-slate-300">
          Email
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-sm text-slate-300">
          Password
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-medium text-black disabled:opacity-50"
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

export function V2AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading');

  React.useEffect(() => {
    supabaseV2.auth.getSession().then(({ data }) => setState(data.session ? 'signed-in' : 'signed-out'));
  }, []);

  if (state === 'loading') return <main className="min-h-screen bg-[#020205]" />;
  if (state === 'signed-out') return <Navigate to="/signin" replace />;
  return children;
}
