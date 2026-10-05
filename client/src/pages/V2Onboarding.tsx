import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Building2, Loader2, Users, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabaseV2 } from '@/lib/supabase-v2';

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
    supabaseV2.auth.getSession().then(({ data }) => {
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
      const { data, error } = await supabaseV2.rpc('create_organization', {
        p_name: name,
        p_creator_intent: intent,
      });

      if (error) throw error;

      const organizationId = data.id as string;

      if (intent === 'DELEGATED_OPERATOR') {
        if (!inviteEmail.trim()) throw new Error('Enter the business owner email before creating a delegated workspace.');

        const { data: invitation, error: invitationError } = await supabaseV2.rpc(
          'create_organization_invitation',
          {
            p_organization_id: organizationId,
            p_email: inviteEmail.trim(),
            p_purpose: 'OWNER_CLAIM',
            p_role_key: 'OWNER',
          }
        );

        if (invitationError) throw invitationError;

        const token = invitation.token as string;
        setInviteLink(`${window.location.origin}/onboarding?invite=${encodeURIComponent(token)}`);
        toast.success('Workspace created. Owner claim invitation is ready.');
        return;
      }

      toast.success('Workspace created.');
      navigate('/workspace', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create workspace');
    } finally {
      setBusy(false);
    }
  };

  const acceptInvitation = async (event: FormEvent) => {
    event.preventDefault();
    const token = params.get('invite');
    if (!token) return;
    setBusy(true);

    try {
      const { error } = await supabaseV2.rpc('accept_organization_invitation', { p_token: token });
      if (error) throw error;
      toast.success('You now have access to the workspace.');
      navigate('/workspace', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept invitation');
    } finally {
      setBusy(false);
    }
  };

  if (checking) return <main className="min-h-screen bg-[#020205]" />;

  const invitationMode = Boolean(params.get('invite'));

  return (
    <main className="min-h-screen bg-[#020205] px-6 py-12 text-slate-100">
      <section className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <Zap className="text-amber-400" size={22} />
          <span className="font-semibold tracking-wide">ENERLECTRA</span>
        </div>

        {invitationMode ? (
          <form onSubmit={acceptInvitation} className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Owner claim</p>
            <h1 className="mt-3 text-3xl font-semibold">Claim your business workspace</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              This invitation assigns you OWNER authority. Your signed-in email must match the invitation recipient.
            </p>
            <button disabled={busy} className="mt-8 flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-medium text-black disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
              {busy ? 'Accepting…' : 'Accept owner invitation'}
            </button>
          </form>
        ) : (
          <form onSubmit={createWorkspace} className="mt-12">
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Workspace setup</p>
            <h1 className="mt-3 text-3xl font-semibold">Set up your organization</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              You control the business data. Enerlectra provides the operational infrastructure and security boundary.
            </p>

            <label className="mt-8 block text-sm text-slate-300">
              Business / organization name
              <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50" />
            </label>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <button type="button" onClick={() => setIntent('OWNER')} className={`rounded-2xl border p-5 text-left ${intent === 'OWNER' ? 'border-amber-400/60 bg-amber-400/5' : 'border-white/10 bg-white/[0.03]'}`}>
                <Building2 className="mb-3 text-amber-300" size={20} />
                <div className="font-medium">I’m setting this up for my business</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">You become an OWNER and the workspace can operate immediately.</p>
              </button>
              <button type="button" onClick={() => setIntent('DELEGATED_OPERATOR')} className={`rounded-2xl border p-5 text-left ${intent === 'DELEGATED_OPERATOR' ? 'border-amber-400/60 bg-amber-400/5' : 'border-white/10 bg-white/[0.03]'}`}>
                <Users className="mb-3 text-amber-300" size={20} />
                <div className="font-medium">I’m setting this up for someone else</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">You become an OPERATOR while the responsible owner is invited to claim ownership.</p>
              </button>
            </div>

            {intent === 'DELEGATED_OPERATOR' && (
              <label className="mt-6 block text-sm text-slate-300">
                Business owner email
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400/50" />
              </label>
            )}

            <button disabled={busy} className="mt-8 flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-medium text-black disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
              {busy ? 'Creating workspace…' : 'Create workspace'}
            </button>

            {inviteLink && (
              <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
                <p className="text-sm font-medium">Owner claim link</p>
                <p className="mt-2 break-all text-xs leading-5 text-slate-400">{inviteLink}</p>
                <button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-sm">
                  Copy invitation link
                </button>
              </div>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
