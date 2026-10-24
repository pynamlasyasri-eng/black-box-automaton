import { useEffect, useMemo, useState } from 'react';
import { api, errMsg } from '../api';
import type { RevealResult, Validation as ValidationT } from '../types';
import AutomatonDiagram from '../components/AutomatonDiagram';
import { useExperiment } from '../components/ExperimentContext';
import ModelSummary from '../components/ModelSummary';
import { useToast } from '../components/Toast';
import { Badge, ConfirmDialog, NeedCandidate, NeedExperiment, Notice, PageHeader, ResultBadge, Spinner } from '../components/UI';
import { fmt, validateInput } from '../lib/strings';

type Filter = 'all' | 'mismatch' | 'edge' | 'short' | 'random' | 'custom';

export default function Validation() {
  const { current, currentId, reload, candidate, candidateId, setCandidateId } = useExperiment();
  const toast = useToast();
  const [maxLen, setMaxLen] = useState(5);
  const [nRandom, setNRandom] = useState(30);
  const [extra, setExtra] = useState('');
  const [running, setRunning] = useState(false);
  const [fresh, setFresh] = useState<ValidationT | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refining, setRefining] = useState<string | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [reveal, setReveal] = useState<RevealResult | null>(null);

  useEffect(() => { setFresh(null); }, [candidateId]);
  useEffect(() => { setReveal(null); setFresh(null); }, [currentId]);

  const stored = useMemo(() => {
    const list = (current?.validations ?? []).filter((v) => v.candidate_id === candidateId);
    return list.length ? list[list.length - 1] : null;
  }, [current, candidateId]);
  const validation = fresh && fresh.candidate_id === candidateId ? fresh : stored;

  if (!current || currentId === null) return <NeedExperiment />;
  if (!candidate) return <NeedCandidate />;

  const alphabet = current.experiment.machine.alphabet;
  const extraList = extra.split(/[\s,]+/).filter((s) => s.length > 0).map((s) => (s === 'ε' ? '' : s));
  const extraError = extraList.map((w) => validateInput(w, alphabet)).find((x) => x !== null) ?? null;

  async function run() {
    if (currentId === null || !candidate) return;
    setRunning(true);
    try {
      const v = await api.validate(currentId, candidate.id, maxLen, nRandom, extraList);
      setFresh(v);
      await reload();
      toast(v.counterexamples && v.counterexamples.length ? 'info' : 'success',
        v.counterexamples && v.counterexamples.length
          ? `${v.counterexamples.length} counterexample(s) found.` : 'No disagreement on this test set.');
    } catch (e) { toast('error', errMsg(e)); } finally { setRunning(false); }
  }

  async function refine(word: string) {
    if (currentId === null || !candidate) return;
    setRefining(word);
    try {
      const c = await api.refine(currentId, candidate.id, word);
      await reload();
      setCandidateId(c.id);
      toast('success', `Refined: new Model #${c.id} has ${c.dfa.states.length} state(s). Validate it again.`);
    } catch (e) { toast('error', errMsg(e)); } finally { setRefining(null); }
  }

  async function doReveal() {
    if (currentId === null) return;
    setRevealing(true);
    try {
      setReveal(await api.reveal(currentId));
      await reload();
      setConfirmReveal(false);
    } catch (e) { toast('error', errMsg(e)); } finally { setRevealing(false); }
  }

  const rows = (validation?.results ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'mismatch' ? !r.match : r.category === filter);
  const mismatches = validation ? validation.total - validation.matches : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Model Testing & Validation"
        subtitle="Compare the candidate’s predictions with the real black box on fresh strings, including edge cases. Disagreements are counterexamples." />

      <section className="card">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="vc">Candidate model</label>
            <select id="vc" className="input" value={candidateId ?? ''} onChange={(e) => setCandidateId(Number(e.target.value))}>
              {current.candidates.map((c) => <option key={c.id} value={c.id}>Model #{c.id} · {c.dfa.states.length} states</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ml">All strings up to length</label>
            <select id="ml" className="input" value={maxLen} onChange={(e) => setMaxLen(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="nr">Random longer strings</label>
            <input id="nr" type="number" min={0} max={200} className="input" value={nRandom}
              onChange={(e) => setNRandom(Math.min(200, Math.max(0, Number(e.target.value) || 0)))} />
          </div>
          <div>
            <label className="label" htmlFor="ex">Extra strings (optional)</label>
            <input id="ex" className={`input mono ${extraError ? 'border-rose-400' : ''}`} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="space separated" />
          </div>
        </div>
        {extraError && <p className="mt-2 text-xs text-rose-700" role="alert">{extraError}</p>}
        <p className="mt-3 text-xs text-slate-500">Edge cases (ε, single symbols, long repeated runs, alternating patterns) are always included.</p>
        <div className="mt-4"><button className="btn-primary" onClick={run} disabled={running || !!extraError}>{running && <Spinner />}Run validation</button></div>
      </section>

      {validation && (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[['Strings tested', validation.total], ['Agreements', validation.matches], ['Mismatches', mismatches],
              ['Agreement rate', `${(validation.agreement * 100).toFixed(1)}%`]].map(([l, v]) => (
              <div key={String(l)} className={`card py-4 ${l === 'Mismatches' && mismatches > 0 ? 'border-rose-300 bg-rose-50' : ''}`}>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</div>
                <div className="mt-1 text-2xl font-bold text-indigo-700">{v}</div>
              </div>
            ))}
          </section>
          <Notice tone="info">
            Agreement on {validation.total} test strings is <strong>evidence, not proof</strong>. Even 100% agreement does not show
            that the model is equivalent to the black box — only the Reveal check below can verify that exactly.
          </Notice>

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="h2">Comparison table</h2>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filter rows">
                {(['all', 'mismatch', 'edge', 'short', 'random', 'custom'] as Filter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${filter === f ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
                    {f === 'mismatch' ? 'counterexamples' : f}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full">
                <thead className="sticky top-0">
                  <tr><th className="th">Input</th><th className="th">Type</th><th className="th">Black box</th><th className="th">Model predicts</th><th className="th">Match</th><th className="th"></th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No rows for this filter.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.input} className={r.match ? '' : 'bg-rose-50'}>
                      <td className="td mono font-semibold">{fmt(r.input.length > 24 ? r.input.slice(0, 24) + '…' : r.input)}</td>
                      <td className="td capitalize text-slate-600">{r.category}</td>
                      <td className="td"><ResultBadge accepted={r.actual} /></td>
                      <td className="td"><ResultBadge accepted={r.predicted} /></td>
                      <td className="td">{r.match ? <Badge tone="green">match</Badge> : <Badge tone="rose">counterexample</Badge>}</td>
                      <td className="td text-right">
                        {!r.match && (
                          <button className="btn-secondary px-3 py-1 text-xs" disabled={refining !== null} onClick={() => void refine(r.input)}>
                            {refining === r.input && <Spinner className="h-3 w-3" />}Refine model with this
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Refining sends the counterexample to the learner (L* adds it to its table; passive learning adds it to the training data) and creates a new candidate.
            </p>
          </section>
        </>
      )}

      <section className="card">
        <h2 className="h2">Reveal the machine & verify exactly</h2>
        <p className="mt-1 text-sm text-slate-600">
          When you are done experimenting, reveal the secret rule. The server then compares every candidate with the hidden machine
          using an exact product-automaton search, so you can see which candidates are truly equivalent.
        </p>
        <div className="mt-3"><button className="btn-secondary" onClick={() => setConfirmReveal(true)}>
          {reveal || current.experiment.revealed ? 'Show reveal again' : 'Reveal machine'}</button></div>

        {reveal && (
          <div className="mt-5 space-y-5">
            <Notice tone="info"><strong>Secret rule:</strong> {reveal.rule} (minimal DFA has {reveal.minimal_states} states)</Notice>
            <div className="space-y-2">
              {reveal.candidate_checks.map((c) => (
                <div key={c.candidate_id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">Model #{c.candidate_id}</span>
                  <span className="text-slate-500">({c.candidate_states} states, {c.method === 'lstar' ? 'L*' : 'passive'})</span>
                  {c.equivalent
                    ? <Badge tone="green">Proven equivalent to the black box</Badge>
                    : <Badge tone="rose">Not equivalent — shortest counterexample “{fmt(c.shortest_counterexample ?? '')}”</Badge>}
                </div>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div><h3 className="mb-2 text-sm font-semibold text-navy-900">The hidden machine (minimal DFA)</h3><AutomatonDiagram dfa={reveal.minimal_dfa} /></div>
              <div><h3 className="mb-2 text-sm font-semibold text-navy-900">Transition table</h3><ModelSummary dfa={reveal.minimal_dfa} /></div>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog open={confirmReveal} title="Reveal the hidden machine?" busy={revealing} confirmLabel="Reveal"
        message="This shows the secret rule and transition table. You can keep experimenting afterwards, but you will no longer be testing blind."
        onConfirm={() => void doReveal()} onCancel={() => setConfirmReveal(false)} />
    </div>
  );
}
