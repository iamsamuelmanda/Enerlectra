import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { ArrowRight, Loader2, LogIn, UserPlus, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function V2SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const invite = new URLSearchParams(location.search).get('invite');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const onboardingPath = invite
    ? `/onboarding?invite=${encodeURIComponent(invite)}`
    : '/onboarding';

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${onboardingPath}`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Google sign-in could not be started');
      setGoogleBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${onboardingPath}` },
        });
        if (error) throw error;

        if (!data.session) {
          toast.success('Check your email to confirm your account, then continue setup.');
          return;
        }
        navigate(onboardingPath, { replace: true });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate(onboardingPath, { replace: true });
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
          {invite
            ? 'Sign in or create your account to continue with this workspace invitation.'
            : mode === 'signup'
              ? 'Create your account first. You will choose your organization and authority during setup.'
              : 'Sign in to continue to your Enerlectra workspace.'}
        </p>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={busy || googleBusy}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 py-3 font-medium text-slate-900 disabled:opacity-50"
        >
          <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.01 13.22l7.98 6.19C11.95 13.72 17.45 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.93 46.98 31.7 46.98 24.55Z" />
            <path fill="#FBBC05" d="M9.99 28.59A14.4 14.4 0 0 1 9.22 24c0-1.59.27-3.13.76-4.59L2.01 13.22A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.43-6.19Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.87 2.3-8.18 2.3-6.55 0-12.05-4.22-14.01-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
          </svg>
          {googleBusy ? 'Connecting to Google…' : 'Continue with Google'}
        </button>
        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          <span>Or use email</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
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
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setState(data.session ? 'signed-in' : 'signed-out');
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setState(session ? 'signed-in' : 'signed-out');
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (state === 'loading') return <main className="min-h-screen bg-[#020205]" />;
  if (state === 'signed-out') {
    const invite = new URLSearchParams(location.search).get('invite');
    return <Navigate to={invite ? `/signin?invite=${encodeURIComponent(invite)}` : '/signin'} replace />;
  }
  return children;
}
