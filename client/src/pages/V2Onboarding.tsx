import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Building2, Check, Copy, Loader2, ShieldCheck, Users, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type Intent = 'OWNER' | 'DELEGATED_OPERATOR';

export default function V2Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [intent, setIntent] = useState<Intent>('OWNER');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) navigate('/signin', { replace: true });
      setChecking(false);
    });
    return () => { mounted = false; };
  }, [navigate]);

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setInviteLink(null);
    try {
      if (intent === 'DELEGATED_OPERATOR' && !inviteEmail.trim()) throw new Error('Enter the business owner email before creating a delegated workspace.');
      const { data, error } = await supabase.rpc('create_organization', { p_name: name.trim(), p_creator_intent: intent });
      if (error) throw error;
      const organizationId = data.id as string;
      if (intent === 'DELEGATED_OPERATOR') {
        const { data: invitation, error: invitationError } = await supabase.rpc('create_organization_invitation', {
          p_organization_id: organizationId, p_email: inviteEmail.trim(), p_purpose: 'OWNER_CLAIM', p_role_key: 'OWNER',
        });
        if (invitationError) throw invitationError;
        const token = invitation.token as string;
        if (!token) throw new Error('Owner claim invitation was created without a token.');
        setInviteLink(`${window.location.origin}/onboarding?invite=${encodeURIComponent(token)}`);
        toast.success('Workspace created. Owner claim invitation is ready.');
        return;
      }
      toast.success('Workspace created.');
      navigate('/workspace', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create workspace');
    } finally { setBusy(false); }
  };

  const acceptInvitation = async (event: FormEvent) => {
    event.preventDefault();
    const token = params.get('invite');
    if (!token) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('accept_organization_invitation', { p_token: token });
      if (error) throw error;
      toast.success('You now have access to the workspace.');
      navigate('/workspace', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept invitation');
    } finally { setBusy(false); }
  };

  if (checking) return <main className="el-shell min-h-screen"/>;

  const invitationMode = Boolean(params.get('invite'));
  return (
    <main className="el-shell min-h-screen">
      <header className="border-b border-[#e3e7e2] bg-white">
        <div className="el-container flex h-[72px] items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 text-[#202521] no-underline"><span className="grid size-9 place-items-center rounded-xl bg-[#c8f169]"><Zap size={20}/></span><span className="text-sm font-extrabold tracking-[.14em]">ENERLECTRA</span></a>
          <span className="text-xs font-medium text-[#68716b]">Workspace setup · Step 1 of 3</span>
        </div>
      </header>
      <div className="el-container grid gap-8 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.75fr)] lg:gap-12">
        <section>
          <div className="mb-8 flex items-center gap-3">
            {['Account','Organization','Operating context'].map((step,index) => <div key={step} className="flex flex-1 items-center gap-2"><span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${index===0?'bg-[#202521] text-white': 'border border-[#d8ded7] bg-white text-[#68716b]'}`}>{index===0?<Check size={14}/>:index+1}</span><span className="hidden text-xs font-semibold text-[#68716b] sm:inline">{step}</span>{index<2&&<span className="h-px flex-1 bg-[#e3e7e2]"/>}</div>)}
          </div>
          {invitationMode ? (
            <form onSubmit={acceptInvitation} className="el-card p-6 sm:p-9">
              <p className="el-eyebrow">Owner claim</p><h1 className="mt-3 text-3xl font-semibold">Claim your business workspace</h1>
              <p className="mt-3 text-sm leading-6 text-[#68716b]">This invitation assigns you OWNER authority. Your signed-in email must match the invitation recipient.</p>
              <button disabled={busy} className="el-button-primary mt-8">{busy?<Loader2 size={17} className="animate-spin"/>:<ArrowRight size={17}/>} {busy?'Accepting invitation…':'Accept owner invitation'}</button>
            </form>
          ) : (
            <form onSubmit={createWorkspace} className="el-card p-6 sm:p-9">
              <p className="el-eyebrow">Organization profile</p>
              <h1 className="mt-3 text-3xl font-semibold">Set up your company</h1>
              <p className="mt-3 text-sm leading-6 text-[#68716b]">Create your private company workspace. You’ll configure how your business operates next.</p>
              <label className="el-label mt-8">Business or organization name
                <input className="el-input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. SunGrid Energy" autoComplete="organization" required maxLength={120}/>
              </label>
              <fieldset className="mt-7">
                <legend className="el-label mb-3">Who are you setting this up for?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={()=>setIntent('OWNER')} className={`rounded-xl border p-4 text-left transition ${intent==='OWNER'?'border-[#8ba64d] bg-[#f1f7e6] ring-1 ring-[#c8dca0]':'border-[#e3e7e2] bg-white hover:border-[#c4cdc0]'}`}>
                    <span className="grid size-9 place-items-center rounded-lg bg-white text-[#526b2d]"><Building2 size={19}/></span>
                    <span className="mt-3 block text-sm font-semibold text-[#202521]">My own business</span>
                    <span className="mt-1 block text-xs leading-5 text-[#68716b]">You become the owner and can configure the workspace.</span>
                  </button>
                  <button type="button" onClick={()=>setIntent('DELEGATED_OPERATOR')} className={`rounded-xl border p-4 text-left transition ${intent==='DELEGATED_OPERATOR'?'border-[#8ba64d] bg-[#f1f7e6] ring-1 ring-[#c8dca0]':'border-[#e3e7e2] bg-white hover:border-[#c4cdc0]'}`}>
                    <span className="grid size-9 place-items-center rounded-lg bg-white text-[#526b2d]"><Users size={19}/></span>
                    <span className="mt-3 block text-sm font-semibold text-[#202521]">For another business</span>
                    <span className="mt-1 block text-xs leading-5 text-[#68716b]">You set up the workspace and invite the responsible owner to claim it.</span>
                  </button>
                </div>
              </fieldset>
              {intent==='DELEGATED_OPERATOR'&&<label className="el-label mt-6">Business owner email<input className="el-input" type="email" value={inviteEmail} onChange={(e)=>setInviteEmail(e.target.value)} required autoComplete="email" placeholder="owner@company.com"/></label>}
              <button disabled={busy} className="el-button-primary mt-8 w-full sm:w-auto">{busy?<Loader2 size={17} className="animate-spin"/>:<ArrowRight size={17}/>} {busy?'Creating workspace…':'Create organization and continue'}</button>
              {inviteLink&&<div className="mt-6 rounded-xl border border-[#d9e8bd] bg-[#f5f9ed] p-4"><p className="text-sm font-semibold">Owner invitation is ready</p><p className="mt-2 break-all text-xs leading-5 text-[#68716b]">{inviteLink}</p><button type="button" onClick={()=>void navigator.clipboard.writeText(inviteLink).then(()=>toast.success('Invitation link copied'))} className="el-button-secondary mt-3"><Copy size={15}/> Copy invitation link</button></div>}
            </form>
          )}
        </section>
        <aside className="el-dark-panel flex min-h-[300px] flex-col justify-between p-6 sm:p-8 lg:min-h-[480px]">
          <div><p className="el-eyebrow !text-white/50">Your workspace, your authority</p><h2 className="mt-4 text-2xl font-semibold leading-tight sm:text-3xl">One operating foundation. Configured for your business.</h2><p className="mt-4 text-sm leading-6 text-white/65">Solar installer, PAYGo, mini-grid, C&I, maintenance or distributor—your operating context shapes the workspace, not a separate product.</p></div>
          <div className="mt-10 space-y-4">
            {[['Private by design','Your company data remains within its authorized workspace.'],['Authority is explicit','Membership and permissions govern what each person can do.'],['Setup can evolve','Configure operating context and team capabilities as the business changes.']].map(([title,text])=><div key={title} className="border-t border-white/10 pt-4"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-white/55">{text}</p></div>)}
          </div>
          <div className="mt-8 flex items-center gap-2 text-xs text-white/50"><ShieldCheck size={16} className="text-[#c8f169]"/> Organization access is resolved server-side</div>
        </aside>
      </div>
    </main>
  );
}
