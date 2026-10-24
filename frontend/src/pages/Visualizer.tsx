import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, errMsg } from '../api';
import type { TraceResult } from '../types';
import AutomatonDiagram from '../components/AutomatonDiagram';
import type { ActiveEdge } from '../components/AutomatonDiagram';
import { useExperiment } from '../components/ExperimentContext';
import { useToast } from '../components/Toast';
import { NeedCandidate, NeedExperiment, PageHeader, ResultBadge, Spinner } from '../components/UI';
import { fmt, validateInput } from '../lib/strings';

export default function Visualizer() {
  const { current, currentId, candidate, candidateId, setCandidateId } = useExperiment();
  const toast = useToast();
  const [text, setText] = useState('');
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(900);
  const [loading, setLoading] = useState(false);

  // A different candidate invalidates the loaded trace.
  useEffect(() => { setTrace(null); setIdx(0); setPlaying(false); }, [candidateId]);

  useEffect(() => {
    if (!playing || !trace) return;
    if (idx >= trace.steps.length - 1) { setPlaying(false); return; }
    const t = window.setTimeout(() => setIdx((i) => i + 1), speed);
    return () => window.clearTimeout(t);
  }, [playing, idx, trace, speed]);

  const alphabet = candidate?.dfa.alphabet ?? [];
  const error = useMemo(() => validateInput(text, alphabet), [text, alphabet]);

  if (!current || currentId === null) return <NeedExperiment />;
  if (!candidate) return <NeedCandidate />;

  const steps = trace?.steps ?? [];
  const step = steps[idx];
  const activeState = step ? step.state : candidate.dfa.initial;
  const activeEdge: ActiveEdge | null =
    step && step.symbol !== null && step.from_state !== null ? { from: step.from_state, to: step.state, symbol: step.symbol } : null;
  const finished = !!trace && idx === steps.length - 1;
  const finalAccepting = candidate.dfa.accepting.includes(activeState);

  async function load(e?: FormEvent) {
    e?.preventDefault();
    if (error || currentId === null || !candidate) return;
    setLoading(true);
    try {
      const t = await api.trace(currentId, candidate.id, text);
      setTrace(t); setIdx(0); setPlaying(false);
    } catch (err) { toast('error', errMsg(err)); } finally { setLoading(false); }
  }

  const reset = () => { setIdx(0); setPlaying(false); };
  const togglePlay = () => {
    if (!trace) return;
    if (idx >= steps.length - 1) setIdx(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Automaton Visualizer"
        subtitle="Watch the candidate DFA read a string one symbol at a time. The current state and the transition just taken are highlighted." />

      <section className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="cand">Candidate model</label>
            <select id="cand" className="input" value={candidateId ?? ''} onChange={(e) => setCandidateId(Number(e.target.value))}>
              {current.candidates.map((c) => <option key={c.id} value={c.id}>Model #{c.id} · {c.dfa.states.length} states · {c.method === 'lstar' ? 'L*' : 'Passive'}</option>)}
            </select>
          </div>
          <form onSubmit={load} className="flex min-w-[16rem] flex-1 flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label className="label" htmlFor="vstr">String to simulate (alphabet {'{'}{alphabet.join(', ')}{'}'})</label>
              <input id="vstr" className={`input mono ${error ? 'border-rose-400' : ''}`} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="empty = ε" autoComplete="off" spellCheck={false} aria-invalid={!!error} />
            </div>
            <button type="submit" className="btn-primary" disabled={!!error || loading}>{loading && <Spinner />}Load string</button>
          </form>
        </div>
        {error && <p className="mt-2 text-xs text-rose-700" role="alert">{error}</p>}
      </section>

      <section className="card">
        <AutomatonDiagram dfa={candidate.dfa} activeState={activeState} activeEdge={activeEdge}
          caption="Cyan highlight = current state and the transition just taken" />

        {!trace ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Enter a string above and press “Load string” to enable playback. The diagram currently shows the initial state.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-1" aria-label="Input tape">
              {trace.input === '' ? <span className="mono rounded-lg bg-slate-100 px-3 py-1.5 text-lg">ε</span> :
                Array.from(trace.input).map((ch, i) => (
                  <span key={i} className={`mono flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-bold transition ${
                    i + 1 === idx ? 'border-cyan-500 bg-cyan-100 text-cyan-900' : i + 1 < idx ? 'border-indigo-200 bg-indigo-50 text-indigo-400' : 'border-slate-200 bg-white text-slate-700'}`}>
                    {ch}
                  </span>
                ))}
            </div>
            <div className="text-sm text-slate-700" aria-live="polite">
              {idx === 0
                ? <>Step 0: in the initial state <strong className="mono">{candidate.dfa.initial}</strong>.</>
                : <>Step {idx}: read <strong className="mono">{step.symbol}</strong>, moved <strong className="mono">{step.from_state}</strong> → <strong className="mono">{step.state}</strong>.</>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-secondary" onClick={reset}>Reset</button>
              <button className="btn-secondary" onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} disabled={idx === 0}>← Back</button>
              <button className="btn-primary" onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
              <button className="btn-secondary" onClick={() => { setPlaying(false); setIdx((i) => Math.min(steps.length - 1, i + 1)); }} disabled={finished}>Step →</button>
              <label className="ml-2 flex items-center gap-2 text-sm text-slate-600">Speed
                <select className="input w-auto py-1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  <option value={1500}>Slow</option><option value={900}>Normal</option><option value={400}>Fast</option>
                </select>
              </label>
            </div>
            {finished && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4" aria-live="polite">
                <span className="text-sm">Finished in state <strong className="mono">{activeState}</strong>
                  {finalAccepting ? ' (accepting)' : ' (not accepting)'} → the candidate says</span>
                <ResultBadge accepted={finalAccepting} large />
                <span className="text-xs text-slate-500">String: <span className="mono">{fmt(trace.input)}</span></span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
