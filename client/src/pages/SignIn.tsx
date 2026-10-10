import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { ArrowRight, Loader2, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
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
    <main className="el-shell grid min-h-screen min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,.9fr)]">
      <section className="flex flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
        <a href="/" className="flex w-fit items-center gap-2.5 text-[#202521] no-underline" aria-label="Enerlectra home">
          <span className="text-sm font-extrabold tracking-[.14em]">ENERLECTRA</span>
        </a>
        <div className="mx-auto my-auto w-full max-w-md py-12">
          <p className="el-eyebrow">Your operational workspace</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-3 text-sm leading-6 text-[#68716b]">
            {invite ? 'Continue with your organization invitation.' : mode === 'signup' ? 'Start with your account. You’ll configure your organization and operating context next.' : 'Sign in to see what needs attention and coordinate work across your organization.'}
          </p>
          <div className="mt-7 grid grid-cols-1 gap-1 rounded-xl border border-[#e3e7e2] bg-white p-1 min-[360px]:grid-cols-2">
            <button type="button" onClick={() => setMode('signin')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${mode === 'signin' ? 'bg-[#202521] text-white' : 'text-[#68716b] hover:bg-[#f4f6f1]'}`}><LogIn size={16}/> Sign in</button>
            <button type="button" onClick={() => setMode('signup')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${mode === 'signup' ? 'bg-[#202521] text-white' : 'text-[#68716b] hover:bg-[#f4f6f1]'}`}><UserPlus size={16}/> Create account</button>
          </div>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="el-label">Work email
              <input className="el-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required/>
            </label>
            <label className="el-label">Password
              <input className="el-input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required/>
            </label>
            <button disabled={busy} className="el-button-primary w-full">
              {busy ? <Loader2 className="animate-spin" size={18}/> : <ArrowRight size={18}/>}
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in to Enerlectra'}
            </button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-[#929a92]"><span className="h-px flex-1 bg-[#e3e7e2]"/><span>or continue with</span><span className="h-px flex-1 bg-[#e3e7e2]"/></div>
          <GoogleSignIn />
          <p className="mt-6 text-center text-xs leading-5 text-[#68716b]">Your organization’s data stays within its authorized workspace.</p>
        </div>
        <p className="text-xs text-[#929a92]">© Enerlectra · Operational intelligence</p>
      </section>
      <aside className="hidden flex-col justify-between bg-[#202521] p-10 text-white lg:flex xl:p-14">
        <div className="el-eyebrow !text-white/50">Operational intelligence</div>
        <div className="max-w-lg">
          <div className="mb-8 grid size-14 place-items-center rounded-2xl bg-[#c8f169] text-[#253019]"><ShieldCheck size={28}/></div>
          <h2 className="text-4xl font-semibold leading-tight xl:text-5xl">Clear situations. Controlled work. Verified outcomes.</h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/65">Coordinate energy operations from customer reports through authorized work to verified outcomes.</p>
          <div className="mt-8 space-y-3">
            {['One workspace for your team','Authority remains explicit','Evidence stays connected to the outcome'].map((item) => <div key={item} className="flex items-center gap-3 text-sm text-white/80"><span className="grid size-6 place-items-center rounded-full bg-white/10 text-[#c8f169]"><ShieldCheck size={14}/></span>{item}</div>)}
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
