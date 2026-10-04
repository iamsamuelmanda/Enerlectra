import { Link } from 'react-router-dom';
import { Activity, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export default function V2Home() {
  return (
    <main className="min-h-screen bg-[#020205] text-slate-100">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Zap className="text-amber-400" size={22} />
          <span className="font-semibold tracking-wide">ENERLECTRA</span>
          <span className="rounded-full border border-amber-400/30 px-2 py-1 text-[10px] uppercase tracking-widest text-amber-300">V2 workspace</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="mb-4 text-xs uppercase tracking-[0.25em] text-amber-300">Operational infrastructure for distributed energy</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
          See operational issues clearly. Coordinate the work to resolve them.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">
          Enerlectra connects customer reports and system evidence to operational situations,
          assigned work, authorized actions and verification.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <Activity className="mb-4 text-amber-300" />
            <h2 className="font-medium">Operational issues</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Capture an issue as evidence, an event, a situation and a work item.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <ShieldCheck className="mb-4 text-amber-300" />
            <h2 className="font-medium">Tenant security</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Access is based on verified actors, active organization membership and permissions.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <ArrowRight className="mb-4 text-amber-300" />
            <h2 className="font-medium">Controlled execution</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Recommendations, authorization, execution and verification remain distinct steps.</p>
          </article>
        </div>
        <div className="mt-12 border-t border-white/10 pt-6 text-sm text-slate-500">
          The V2 operational API is being brought online. Organization onboarding and the authenticated
          workspace UI are not yet enabled.
          <div className="mt-4"><Link className="text-amber-300 hover:text-amber-200" to="/signin">Legacy sign-in (temporary)</Link></div>
        </div>
      </section>
    </main>
  );
}
