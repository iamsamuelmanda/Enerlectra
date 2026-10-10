import { FormEvent, ReactNode, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { GoogleSignIn } from '@/features/auth/components/GoogleSignIn';

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const invite = new URLSearchParams(location.search).get('invite');
  const requestedMode = new URLSearchParams(location.search).get('mode');
  const [mode, setMode] = useState<'signin' | 'signup'>(requestedMode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onboardingPath = invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : '/onboarding';

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
    <main className="el-shell el-auth-layout">
      <section className="el-auth-main">
        <a href="/" className="el-auth-brand" aria-label="Enerlectra home">
          <span className="text-sm font-extrabold tracking-[.14em]">ENERLECTRA</span>
        </a>
        <div className="el-auth-content">
          <p className="el-eyebrow">Your operational workspace</p>
          <h1 className="el-auth-heading">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p className="el-auth-description">
            {invite ? 'Continue with your organization invitation.' : mode === 'signup' ? 'Start with your account. You’ll configure your organization and operating context next.' : 'Sign in to see what needs attention and coordinate work across your organization.'}
          </p>
          <div className="el-auth-switch">
            <button type="button" onClick={() => setMode('signin')} aria-pressed={mode === 'signin'}>Sign in</button>
            <button type="button" onClick={() => setMode('signup')} aria-pressed={mode === 'signup'}>Create account</button>
          </div>
          <form onSubmit={submit} className="el-auth-form">
            <label className="el-label">Work email
              <input className="el-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required/>
            </label>
            <label className="el-label">Password
              <input className="el-input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required/>
            </label>
            <button disabled={busy} className="el-button-primary el-auth-submit">
              {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in to Enerlectra'}
            </button>
          </form>
          <div className="el-auth-divider">or continue with</div>
          <GoogleSignIn />
          <p className="el-auth-assurance">Your organization’s data stays within its authorized workspace.</p>
        </div>
        <p className="el-auth-footer">© Enerlectra · Operational intelligence</p>
      </section>
      <aside className="el-auth-aside">
        <div className="el-eyebrow !text-white/50">Operational intelligence</div>
        <div className="max-w-lg">
          <div className="mb-8 grid size-14 place-items-center rounded-2xl bg-[#c8f169] text-[#253019]"><svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg></div>
          <h2 className="text-4xl font-semibold leading-tight xl:text-5xl">Clear situations. Controlled work. Verified outcomes.</h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/65">Coordinate energy operations from customer reports through authorized work to verified outcomes.</p>
          <div className="mt-8 space-y-3">
            {['One workspace for your team','Authority remains explicit','Evidence stays connected to the outcome'].map((item) => <div key={item} className="flex items-center gap-3 text-sm text-white/80"><span className="grid size-6 place-items-center rounded-full bg-white/10 text-[#c8f169]"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6"/></svg></span>{item}</div>)}
          </div>
        </div>
        <p className="text-xs text-white/40">Built for the realities of distributed energy operations.</p>
      </aside>
    </main>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading');
  const location = useLocation();
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) setState(data.session ? 'signed-in' : 'signed-out'); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => { if (mounted) setState(session ? 'signed-in' : 'signed-out'); });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);
  if (state === 'loading') return <main className="el-shell min-h-screen"/>;
  if (state === 'signed-out') {
    const invite = new URLSearchParams(location.search).get('invite');
    return <Navigate to={invite ? `/signin?invite=${encodeURIComponent(invite)}` : '/signin'} replace/>;
  }
  return children;
}
