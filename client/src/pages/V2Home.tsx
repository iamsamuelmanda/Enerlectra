import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const principles = [
  {
    title: 'Understand the situation',
    description: 'Bring customer reports, site context and operational evidence into one view.',
  },
  {
    title: 'Keep authority explicit',
    description: 'Actions follow verified identity, organization membership and assigned permissions.',
  },
  {
    title: 'Verify the outcome',
    description: 'Keep work, evidence and accountable verification connected throughout resolution.',
  },
];

export default function V2Home() {
  return (
    <main className="el-shell">
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="el-container flex min-h-[72px] flex-col justify-center gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="w-fit text-sm font-bold tracking-[.12em] no-underline" aria-label="Enerlectra home">
            ENERLECTRA
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
            <span className="hidden pr-3 text-sm text-[var(--color-ink-muted)] md:inline">Operational intelligence</span>
            <Link to="/signin" className="el-button-secondary">Sign in</Link>
            <Link to="/signin?mode=signup" className="el-button-primary">Get started <ArrowRight size={16} aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>

      <section className="el-container grid min-w-0 gap-10 py-12 sm:py-16 md:grid-cols-[1fr_.78fr] md:items-center md:py-24">
        <div className="min-w-0">
          <p className="el-eyebrow">Operational intelligence for energy businesses</p>
          <h1 className="mt-5 max-w-[680px] text-4xl font-semibold leading-tight sm:text-5xl lg:text-[3.6rem]">
            From operational uncertainty to verified outcomes.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[var(--color-ink-soft)] sm:text-lg">
            Enerlectra connects organizational context, customer reports, evidence, work and verification in one accountable operating system.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signin?mode=signup" className="el-button-primary">Create an account <ArrowRight size={16} aria-hidden="true" /></Link>
            <a href="#operating-model" className="el-button-secondary">How it works</a>
          </div>
          <p className="mt-5 max-w-lg text-xs leading-5 text-[var(--color-ink-muted)]">
            Operational records appear after you sign in and connect an authorized organization. This page does not display fabricated activity.
          </p>
        </div>

        <aside className="el-card min-w-0 p-6 sm:p-8" aria-label="Operating principles">
          <p className="el-eyebrow">Built around accountability</p>
          <h2 className="mt-3 text-2xl font-semibold">One operational thread</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            Evidence informs a situation. A recommendation informs a decision. Authorization governs action. Verification establishes the outcome.
          </p>
          <ol className="mt-6 divide-y divide-[var(--color-border)]">
            {['Evidence and context', 'Situation and recommendation', 'Authorized work', 'Verification and audit'].map((item, index) => (
              <li key={item} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--color-surface-muted)] text-xs font-semibold text-[var(--color-ink-soft)]" aria-hidden="true">{index + 1}</span>
                <span className="pt-1 text-sm font-medium">{item}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section id="operating-model" className="border-y border-[var(--color-border)] bg-white py-14 sm:py-20">
        <div className="el-container">
          <div className="max-w-2xl">
            <p className="el-eyebrow">A shared operational foundation</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Configured for how your business actually operates.</h2>
            <p className="mt-4 leading-7 text-[var(--color-ink-soft)]">
              EPC, PAYGo, mini-grid, commercial energy and service teams can configure capabilities and workflows without splitting their operational records across disconnected tools.
            </p>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {principles.map(({ title, description }) => (
              <article key={title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] p-5 sm:p-6">
                <h3>{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="el-container flex flex-col gap-2 py-7 text-xs text-[var(--color-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span>ENERLECTRA · Operational intelligence</span>
        <span>Clear authority. Evidence-led work. Verifiable outcomes.</span>
      </footer>
    </main>
  );
}
