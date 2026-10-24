import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import type { Stats } from '../types';
import { Notice, StatCard } from '../components/UI';

function HeroAnimation() {
  return (
    <svg viewBox="0 0 360 200" className="w-full max-w-md" role="img" aria-label="Animated state-transition diagram">
      <defs>
        <marker id="hero-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#67e8f9" />
        </marker>
      </defs>
      <g fill="none" stroke="#67e8f9" strokeWidth="2" opacity="0.9">
        <path d="M62,100 L124,100" markerEnd="url(#hero-arrow)" />
        <path d="M206,100 L268,100" markerEnd="url(#hero-arrow)" />
        <path id="hero-back" d="M290,126 C260,190 100,190 70,126" markerEnd="url(#hero-arrow)" />
        <path d="M150,70 C140,20 180,20 170,68" markerEnd="url(#hero-arrow)" />
      </g>
      <g fill="#0e1747" stroke="#a5b4fc" strokeWidth="2.5">
        <circle cx="40" cy="100" r="26" /><circle cx="165" cy="100" r="26" /><circle cx="290" cy="100" r="26" />
        <circle cx="290" cy="100" r="20" fill="none" />
      </g>
      <g fill="#e0e7ff" fontSize="14" fontWeight="700" textAnchor="middle" dominantBaseline="central">
        <text x="40" y="100">q0</text><text x="165" y="100">q1</text><text x="290" y="100">q2</text>
      </g>
      <g fill="#a5f3fc" fontSize="13" fontWeight="700" textAnchor="middle">
        <text x="93" y="90">0</text><text x="237" y="90">1</text><text x="180" y="30">0</text><text x="180" y="178">1</text>
      </g>
      <circle r="6" fill="#22d3ee">
        <animateMotion dur="5s" repeatCount="indefinite" path="M40,100 L165,100 L290,100 C260,190 100,190 40,100" />
      </circle>
      <text x="165" y="150" textAnchor="middle" fill="#c7d2fe" fontSize="12" opacity="0.8">? ? ?</text>
    </svg>
  );
}

const STEPS = [
  ['1. Probe', 'Pick a mystery machine and ask it questions. Each string you send comes back ACCEPTED or REJECTED — the rules inside stay hidden.'],
  ['2. Infer', 'The learner (Angluin’s L* or passive state merging) builds a candidate DFA that explains every observation collected so far.'],
  ['3. Visualize', 'Inspect the candidate’s states and transitions and step through any string to see exactly how the model decides.'],
  ['4. Validate', 'Test the candidate on fresh strings and edge cases. Any disagreement is a counterexample that can be used to refine the model.'],
];

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.stats().then(setStats).catch((e) => setError(errMsg(e))); }, []);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-800 to-indigo-700 p-6 text-white shadow-lg sm:p-10">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="animate-fadeUp">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Theory of Computation project</p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">Black Box Automaton</h1>
            <p className="mt-3 text-indigo-100">
              An interactive platform for finite automata learning, inference and validation. Observe an unknown machine
              from the outside, infer a model of it, and test whether that model really predicts its behaviour.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/lab" className="btn-accent">Start Experiment</Link>
              <Link to="/visualizer" className="btn border border-white/30 text-white hover:bg-white/10">Explore Automata</Link>
              <Link to="/history" className="btn border border-white/30 text-white hover:bg-white/10">View History</Link>
            </div>
          </div>
          <div className="flex justify-center"><HeroAnimation /></div>
        </div>
      </section>

      <section aria-label="Overview">
        {error && <Notice tone="error">Could not load statistics: {error}</Notice>}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Experiments started" value={stats?.experiments ?? '–'} />
          <StatCard label="Experiments validated" value={stats?.experiments_completed ?? '–'} hint="At least one validation run" />
          <StatCard label="Strings tested" value={stats?.strings_tested ?? '–'} hint="Distinct strings across experiments" />
          <StatCard label="Candidate models" value={stats?.candidate_models ?? '–'} hint="Inferred DFAs saved" />
        </div>
      </section>

      <section>
        <h2 className="h2 mb-3">How black-box learning works</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text]) => (
            <div key={title} className="card">
              <h3 className="font-semibold text-indigo-700">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Notice tone="info">
            <strong>Important:</strong> a learned automaton is a <em>candidate</em>. Finitely many observations can never prove
            that the model is identical to the black box — that is why validation and counterexamples matter.
          </Notice>
        </div>
      </section>
    </div>
  );
}
