import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { ArrowRight, Loader2, LogIn, UserPlus, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabaseV2 } from '@/lib/supabase-v2';

export default function V2SignIn() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabaseV2.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) throw error;

        if (!data.session) {
          toast.success('Check your email to confirm your account, then continue setup.');
          return;
        }
        navigate('/onboarding', { replace: true });
        return;
      }

      const { error } = await supabaseV2.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate('/onboarding', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020205] px-6 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="mb-8 flex items-center gap-3"><Zap className="text-amber-400" size={22} /><span className="font-semibold tracking-wide">ENERLECTRA</span></div>
        <div className="flex gap-2 rounded-xl bg-black/20 p-1">
          <button type="button" onClick={() => setMode('signin')} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode === 'signin' ? 'bg-white/10 text-white' : 'text-slate-400'}`}><LogIn className="mr-2 inline" size={16} />Sign in</button>
          <button type="button" onClick={() => setMode('signup')} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode === 'signup' ? 'bg-white/10 text-white' : 'text-slate-400'}`}><UserPlus className="mr-2 inline" size={16} />Create account</button>
        </div>
        <h1 className="mt-8 text-2xl font-semibold">{mode === 'signup' ? 'Create your Enerlectra account' : 'Sign in'}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {mode === 'signup' ? 'Create your account first. You will choose your organization and authority during setup.' : 'Sign in to continue to your Enerlectra workspace.'}
        </p>
        <label className="mt-6 block text-sm text-slate-300">Email
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="mt-4 block text-sm text-slate-300">Password
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-medium text-black disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

export function V2AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading');

  useEffect(() => {
    let mounted = true;
    supabaseV2.auth.getSession().then(({ data }) => {
      if (mounted) setState(data.session ? 'signed-in' : 'signed-out');
    });
    const { data: subscription } = supabaseV2.auth.onAuthStateChange((_event, session) => {
      if (mounted) setState(session ? 'signed-in' : 'signed-out');
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (state === 'loading') return <main className="min-h-screen bg-[#020205]" />;
  if (state === 'signed-out') return <Navigate to="/signin" replace />;
  return children;
}
