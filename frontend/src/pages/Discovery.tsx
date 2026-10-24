import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import type { Method } from '../types';
import AutomatonDiagram from '../components/AutomatonDiagram';
import { useExperiment } from '../components/ExperimentContext';
import ModelSummary from '../components/ModelSummary';
import { useToast } from '../components/Toast';
import { Badge, NeedExperiment, Notice, PageHeader, Spinner } from '../components/UI';
import { fmt, fmtDate } from '../lib/strings';

const METHOD_NAME: Record<Method, string> = { lstar: "Angluin's L*", passive: 'Passive (RPNI)' };

export default function Discovery() {
  const { current, currentId, reload, candidate, candidateId, setCandidateId } = useExperiment();
  const toast = useToast();
  const [method, setMethod] = useState<Method>('lstar');
  const [k, setK] = useState(4);
  const [running, setRunning] = useState(false);
  const [querying, setQuerying] = useState(false);

  if (!current || currentId === null) return <NeedExperiment />;
  const observations = current.observations.length;

  async function run() {
    if (currentId === null) return;
    setRunning(true);
    try {
      const c = await api.discover(currentId, method, k);
      await reload();
      setCandidateId(c.id);
      toast('success', `Inferred a candidate with ${c.dfa.states.length} state(s) using ${METHOD_NAME[method]}.`);
    } catch (e) { toast('error', errMsg(e)); } finally { setRunning(false); }
  }

  async function querySuggestions(strings: string[]) {
    if (currentId === null) return;
    setQuerying(true);
    try {
      await api.queryBatch(currentId, strings);
      await reload();
      toast('success', `Queried ${strings.length} suggested string(s). Run discovery again to use them.`);
    } catch (e) { toast('error', errMsg(e)); } finally { setQuerying(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Automaton Discovery"
        subtitle="Turn input–output observations into a candidate DFA. A candidate explains what has been observed; it is not a proof that it equals the hidden machine." />

      <section className="card">
        <h2 className="h2">Run an inference method</h2>
        <p className="mt-1 text-sm text-slate-600">This experiment has <strong>{observations}</strong> recorded observation(s).</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(['lstar', 'passive'] as Method[]).map((m) => (
            <button key={m} onClick={() => setMethod(m)} aria-pressed={method === m}
              className={`rounded-xl border p-4 text-left transition ${method === m ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}>
              <div className="font-semibold text-navy-900">{METHOD_NAME[m]}</div>
              <p className="mt-1 text-sm text-slate-600">
                {m === 'lstar'
                  ? 'Active learning. Asks the black box new membership queries, builds an observation table, and keeps refining until no counterexample is found. The equivalence check is approximated by testing.'
                  : 'Passive learning. Uses only the observations already collected: builds a prefix tree and merges states while staying consistent. Never asks new questions, so sparse data gives guesses.'}
              </p>
            </button>
          ))}
        </div>
        {method === 'lstar' && (
          <div className="mt-4 max-w-md">
            <label className="label" htmlFor="k">Equivalence test depth k = {k}</label>
            <input id="k" type="range" min={0} max={8} value={k} onChange={(e) => setK(Number(e.target.value))} className="w-full accent-indigo-600" />
            <p className="mt-1 text-xs text-slate-500">
              After each hypothesis, L* tests every string of length ≤ k. Small k is fast but can miss differences — try k = 1 and then validate.
            </p>
          </div>
        )}
        <div className="mt-5">
          <button className="btn-primary" onClick={run} disabled={running}>{running && <Spinner />}Infer candidate model</button>
        </div>
      </section>

      {current.candidates.length === 0 ? (
        <div className="card text-sm text-slate-600">No candidate models yet. Run an inference method above.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="card h-fit">
            <h2 className="h2">Candidates</h2>
            <ul className="mt-3 space-y-2">
              {[...current.candidates].reverse().map((c) => (
                <li key={c.id}>
                  <button onClick={() => setCandidateId(c.id)} aria-pressed={c.id === candidateId}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${c.id === candidateId ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                    <div className="font-semibold">Model #{c.id} · {c.dfa.states.length} states</div>
                    <div className="text-xs text-slate-500">{METHOD_NAME[c.method]}{c.info.refined_from ? ` · refined from #${c.info.refined_from}` : ''}</div>
                    <div className="text-xs text-slate-400">{fmtDate(c.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {candidate && (
            <div className="space-y-6">
              <section className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="h2 mr-2">Model #{candidate.id}</h2>
                  <Badge tone="amber">Candidate — not proven equivalent</Badge>
                  <Badge>{METHOD_NAME[candidate.method]}</Badge>
                  <Badge tone="cyan">{candidate.dfa.states.length} states</Badge>
                  <Badge tone="slate">fits {candidate.info.stats.observations_fit}/{candidate.info.stats.observations_total} observations</Badge>
                </div>
                <div className="mt-4"><AutomatonDiagram dfa={candidate.dfa} /></div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/visualizer" className="btn-secondary">Step through strings</Link>
                  <Link to="/validation" className="btn-primary">Test this model</Link>
                </div>
              </section>

              <section className="card">
                <h2 className="h2">How the observations support this model</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                  {candidate.info.explanation.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
                <div className="mt-4 space-y-2">
                  {candidate.info.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
                </div>
                {candidate.info.suggestions.length > 0 && (
                  <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-sm font-semibold text-cyan-900">Suggested additional queries</div>
                    <p className="mt-1 text-sm text-cyan-900">These strings would show what the model does in places no observation covers:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {candidate.info.suggestions.map((s) => <span key={s} className="mono rounded-lg bg-white px-2 py-1 text-sm font-semibold">{fmt(s)}</span>)}
                    </div>
                    <button className="btn-secondary mt-3" disabled={querying} onClick={() => void querySuggestions(candidate.info.suggestions)}>
                      {querying && <Spinner />}Query these strings
                    </button>
                  </div>
                )}
              </section>

              <section className="card">
                <h2 className="h2">Formal definition</h2>
                <div className="mt-3"><ModelSummary dfa={candidate.dfa} access={candidate.info.access} /></div>
              </section>

              {candidate.method === 'lstar' && candidate.info.table && candidate.info.suffixes && (
                <section className="card">
                  <h2 className="h2">L* observation table</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Rows are prefixes, columns are suffixes; a cell is 1 if the black box accepts prefix + suffix. Rows with identical
                    contents become the same state. The lower rows (S·Σ) show where each transition leads.
                    Used {candidate.info.membership_queries} distinct membership queries and {candidate.info.equivalence_queries} equivalence round(s).
                  </p>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full">
                      <thead><tr><th className="th">Prefix</th>{candidate.info.suffixes.map((e) => <th key={e} className="th mono normal-case">{fmt(e)}</th>)}</tr></thead>
                      <tbody>
                        {candidate.info.table.map((r) => (
                          <tr key={r.prefix} className={r.region === 'S' ? '' : 'bg-slate-50 text-slate-600'}>
                            <td className="td mono font-semibold">{fmt(r.prefix)}{r.region === 'S' ? '' : ' (S·Σ)'}</td>
                            {r.row.map((bit, j) => <td key={j} className="td mono">{bit}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
