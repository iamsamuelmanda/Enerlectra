import { Activity, ArrowRight, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const capabilities = [
  { icon: Activity, number: '01', title: 'See the whole situation', text: 'Bring customer reports, site evidence and system events into one operational picture.' },
  { icon: ShieldCheck, number: '02', title: 'Keep authority explicit', text: 'Every action follows verified identity, organization membership and the right permissions.' },
  { icon: CheckCircle2, number: '03', title: 'Close the loop', text: 'Coordinate assigned work, record evidence and verify the outcome before closing an issue.' },
];

export default function V2Home() {
  return (
    <main className="el-shell">
      <header className="border-b border-[#e3e7e2] bg-white">
        <div className="el-container flex h-[76px] items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-[#202521] no-underline" aria-label="Enerlectra home">
            <span className="grid size-9 place-items-center rounded-xl bg-[#c8f169]"><Zap size={20} strokeWidth={2.5} /></span>
            <span className="text-sm font-extrabold tracking-[.14em]">ENERLECTRA</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[#68716b] sm:inline">The Energy Internet</span>
            <Link to="/signin" className="el-button-secondary no-underline">Sign in</Link>
            <Link to="/signin?mode=signup" className="el-button-primary no-underline">Get started <ArrowRight size={16} /></Link>
          </div>
        </div>
      </header>

      <section className="el-container grid gap-12 pb-16 pt-14 md:grid-cols-[.92fr_1.08fr] md:items-center md:pb-24 md:pt-20">
        <div>
          <p className="el-eyebrow flex items-center gap-2"><span className="size-2 rounded-full bg-[#7b9a37]" /> Operational infrastructure for distributed energy</p>
          <h1 className="mt-5 max-w-[620px] text-4xl font-semibold leading-[1.06] sm:text-5xl lg:text-[3.65rem]">Run operations from <span className="text-[#657b3e]">one place.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#68716b] sm:text-lg">From the first customer report to verified resolution, Enerlectra helps energy teams understand what is happening and coordinate the next right action.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signin?mode=signup" className="el-button-primary no-underline">Create your workspace <ArrowRight size={17} /></Link>
            <a href="#how-it-works" className="el-button-secondary no-underline">Explore the platform</a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#68716b]">
            <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#657b3e]" /> Configurable to your business</span>
            <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#657b3e]" /> Tenant-scoped by design</span>
          </div>
        </div>

        <div className="el-card overflow-hidden p-3 sm:p-4">
          <div className="flex items-center justify-between border-b border-[#e3e7e2] px-3 pb-4 pt-2">
            <div><p className="text-sm font-bold">Operations overview</p><p className="mt-1 text-xs text-[#68716b]">A single view of work that needs attention</p></div>
            <span className="rounded-full bg-[#eff6e3] px-3 py-1.5 text-xs font-semibold text-[#4f6729]">Workspace preview</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 py-4">
            {[['12','Open issues'],['03','Need attention'],['07','Active work']].map(([value,label]) => <div key={label} className="rounded-xl border border-[#e3e7e2] bg-[#fafbf8] p-3"><p className="text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-[11px] leading-4 text-[#68716b]">{label}</p></div>)}
          </div>
          <div className="el-dark-panel p-4 sm:p-5">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Needs attention</p><span className="text-xs text-white/55">Illustrative preview</span></div>
            <div className="mt-4 space-y-2.5">
              {[
                ['CRITICAL','Inverter offline — Kafue 04','Field investigation'],
                ['HIGH','Commissioning evidence missing','Commissioning'],
                ['HIGH','Payment mismatch — Customer 0182','Payment reconciliation'],
              ].map(([level,title,work]) => <div key={title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.04] p-3">
                <span className={`mt-0.5 rounded-md px-2 py-1 text-[9px] font-bold tracking-wide ${level === 'CRITICAL' ? 'bg-[#f7d7d2] text-[#8d3026]' : 'bg-[#f7e7be] text-[#76520a]'}`}>{level}</span>
                <div className="min-w-0"><p className="text-xs font-semibold text-white">{title}</p><p className="mt-1 text-[11px] text-white/60">Recommended next: {work}</p></div>
                <ArrowRight className="ml-auto mt-1 shrink-0 text-white/50" size={15} />
              </div>)}
            </div>
            <p className="mt-4 text-[11px] leading-5 text-white/50">Recommendations guide the team. Authorization, execution and verification remain separate steps.</p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-[#e3e7e2] bg-white py-16 md:py-20">
        <div className="el-container">
          <div className="max-w-2xl"><p className="el-eyebrow">One operational model</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Your business is different. Your operating foundation shouldn't be.</h2><p className="mt-4 leading-7 text-[#68716b]">Configure Enerlectra around the way your team works—without splitting customers, sites, work and evidence across disconnected tools.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {capabilities.map(({icon: Icon,number,title,text}) => <article key={number} className="rounded-2xl border border-[#e3e7e2] bg-[#fafbf8] p-6 sm:p-7"><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-[#edf4df] text-[#526b2d]"><Icon size={21}/></span><span className="text-xs font-semibold tracking-widest text-[#929a92]">{number}</span></div><h3 className="mt-6 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[#68716b]">{text}</p></article>)}
          </div>
        </div>
      </section>
      <footer className="el-container flex flex-col gap-3 py-7 text-xs text-[#68716b] sm:flex-row sm:items-center sm:justify-between"><span>ENERLECTRA · The Energy Internet</span><span>One workspace. Clear authority. Verifiable outcomes.</span></footer>
    </main>
  );
}
