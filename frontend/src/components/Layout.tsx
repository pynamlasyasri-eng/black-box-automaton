import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useExperiment } from './ExperimentContext';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/lab', label: 'Black Box Lab' },
  { to: '/discovery', label: 'Automaton Discovery' },
  { to: '/visualizer', label: 'Automaton Visualizer' },
  { to: '/validation', label: 'Model Testing' },
  { to: '/history', label: 'Experiment History' },
  { to: '/help', label: 'Learn & Help' },
];

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1b2a6b" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="#22d3ee" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="4" fill="none" stroke="#22d3ee" strokeWidth="2" />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { current } = useExperiment();

  const links = (
    <nav className="flex flex-col gap-1 px-3" aria-label="Main">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition ${
              isActive ? 'border-cyan-400 bg-indigo-500/25 text-white' : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'}`}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 to-slate-50">
      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-950 px-4 py-3 text-white lg:hidden">
        <Link to="/" className="flex items-center gap-2 font-semibold"><Logo />Black Box Automaton</Link>
        <button className="rounded-lg border border-white/20 px-3 py-1.5 text-sm" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-label="Toggle navigation">{open ? 'Close' : 'Menu'}</button>
      </header>
      {open && <div className="z-20 bg-navy-950 pb-4 lg:hidden">{links}</div>}

      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-navy-950 py-5 lg:flex">
        <Link to="/" className="mb-6 flex items-center gap-3 px-5 text-white">
          <Logo />
          <span className="leading-tight"><span className="block text-sm font-bold">Black Box</span><span className="block text-sm font-bold text-cyan-300">Automaton</span></span>
        </Link>
        {links}
        <div className="mt-auto px-5 text-xs text-slate-400"><br />Finite automata learning</div>
      </aside>

      <div className="lg:pl-64">
        <div className="border-b border-indigo-100 bg-white/70 px-4 py-2 text-xs text-slate-600 backdrop-blur sm:px-8">
          {current ? (
            <span>Current experiment: <strong className="text-navy-900">{current.experiment.name}</strong> · {current.experiment.machine.name} · alphabet {'{'}{current.experiment.machine.alphabet.join(', ')}{'}'}</span>
          ) : (
            <span>No experiment selected — <Link className="font-semibold text-indigo-700 underline" to="/lab">start one in the Lab</Link></span>
          )}
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
