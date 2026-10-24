import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import type { Machine, QueryResult, Stats } from '../types';
import { useExperiment } from '../components/ExperimentContext';
import { useToast } from '../components/Toast';
import { Badge, ResultBadge, Spinner } from '../components/UI';
import { allStrings, fmt, SOURCE_LABELS, validateInput } from '../lib/strings';

export default function Lab() {
  const { current, currentId, select, reload } = useExperiment();
  const toast = useToast();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [picked, setPicked] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<QueryResult | null>(null);
  const [probeLen, setProbeLen] = useState(3);

  const refreshStats = () => api.stats().then(setStats).catch(() => undefined);
  useEffect(() => {
    api.machines().then((m) => { setMachines(m); if (m.length) setPicked((p) => p || m[0].id); })
      .catch((e) => toast('error', errMsg(e)));
    void refreshStats();
  }, [toast]);

  const alphabet = current?.experiment.machine.alphabet ?? [];
  const error = useMemo(() => validateInput(text, alphabet), [text, alphabet]);
  const observations = current?.observations ?? [];
  const accepted = observations.filter((o) => o.accepted).length;
  const probeCount = alphabet.length ? (alphabet.length ** (probeLen + 1) - 1) / (alphabet.length - 1) : 0;

  async function start() {
    setCreating(true);
    try {
      const exp = await api.createExperiment(picked, name.trim());
      select(exp.id);
      setLast(null); setText(''); setName('');
      toast('success', `Started “${exp.name}”. The machine’s rule is hidden — start probing!`);
      void refreshStats();
    } catch (e) { toast('error', errMsg(e)); } finally { setCreating(false); }
  }

  async function ask(value: string) {
    if (currentId === null) return;
    const problem = validateInput(value, alphabet);
    if (problem) { toast('error', problem); return; }
    setBusy(true);
    try {
      const r = await api.query(currentId, value);
      setLast(r);
      await reload();
      void refreshStats();
      setText('');
    } catch (e) { toast('error', errMsg(e)); } finally { setBusy(false); }
  }

  async function probeAll() {
    if (currentId === null) return;
    setBusy(true);
    try {
      const r = await api.queryBatch(currentId, allStrings(alphabet, probeLen));
      const fresh = r.results.filter((x) => x.new).length;
      await reload();
      void refreshStats();
      toast('success', `Queried ${r.results.length} strings (${fresh} new).`);
    } catch (e) { toast('error', errMsg(e)); } finally { setBusy(false); }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (!error) void ask(text); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Black Box Lab</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Choose a mystery machine, then send it strings. You only ever see ACCEPTED or REJECTED — the internal states
          and transitions are never shown. Work out what it does from the outside.
        </p>
      </div>

      <section className="card">
        <h2 className="h2">1. Choose a mystery machine</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {machines.map((m) => (
            <button key={m.id} onClick={() => setPicked(m.id)} aria-pressed={picked === m.id}
              className={`rounded-xl border p-4 text-left transition ${picked === m.id
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
              <div className="font-semibold text-navy-900">{m.name}</div>
              <div className="mono mt-1 text-sm text-slate-600">Σ = {'{'}{m.alphabet.join(', ')}{'}'}</div>
              <div className="mt-2"><Badge tone={m.difficulty === 'Beginner' ? 'green' : m.difficulty === 'Advanced' ? 'rose' : 'amber'}>{m.difficulty}</Badge></div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className="label" htmlFor="exp-name">Experiment name (optional)</label>
            <input id="exp-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Viva demo run" />
          </div>
          <button className="btn-primary" onClick={start} disabled={!picked || creating}>{creating && <Spinner />}Start new experiment</button>
        </div>
      </section>

      {!current ? (
        <div className="card text-sm text-slate-600">
          No experiment is active. Start one above, or <Link className="font-semibold text-indigo-700 underline" to="/history">open a saved experiment</Link>.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Experiments (all)', stats?.experiments ?? '–'],
              ['Observations (this experiment)', observations.length],
              ['Accepted', accepted],
              ['Rejected', observations.length - accepted],
            ].map(([label, value]) => (
              <div key={String(label)} className="card py-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-bold text-indigo-700">{value}</div>
              </div>
            ))}
          </section>

          <section className="card">
            <h2 className="h2">2. Probe “{current.experiment.machine.name}”</h2>
            <p className="mt-1 text-sm text-slate-600">
              Alphabet <span className="mono font-semibold">{'{'}{alphabet.join(', ')}{'}'}</span>. Leave the box empty to test the empty string ε.
            </p>
            <form onSubmit={onSubmit} className="mt-4">
              <label className="label" htmlFor="probe">Input string</label>
              <div className="flex flex-wrap gap-2">
                <input id="probe" className={`input mono flex-1 min-w-[12rem] ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : ''}`}
                  value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="type a string, or leave empty for ε" aria-invalid={!!error} aria-describedby="probe-help" />
                {alphabet.map((a) => (
                  <button type="button" key={a} className="btn-secondary mono w-11 px-0" onClick={() => setText((t) => t + a)} aria-label={`Append ${a}`}>{a}</button>
                ))}
                <button type="submit" className="btn-primary" disabled={!!error || busy}>{busy && <Spinner />}Test string</button>
              </div>
              <p id="probe-help" className={`mt-1 text-xs ${error ? 'text-rose-700' : 'text-slate-500'}`} role={error ? 'alert' : undefined}>
                {error ?? `Length ${text.length} / 64`}
              </p>
            </form>

            {last && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4" aria-live="polite">
                <span className="text-sm text-slate-600">Result for <span className="mono font-semibold">{fmt(last.input)}</span>:</span>
                <ResultBadge accepted={last.accepted} large />
                {!last.new && <span className="text-xs text-slate-500">(already queried — the machine is deterministic)</span>}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <div>
                <label className="label" htmlFor="probe-len">Query every string up to length</label>
                <select id="probe-len" className="input w-28" value={probeLen} onChange={(e) => setProbeLen(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].filter((n) => (alphabet.length ** (n + 1) - 1) / Math.max(alphabet.length - 1, 1) <= 200).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button className="btn-secondary" onClick={probeAll} disabled={busy}>{busy && <Spinner />}Query {probeCount} strings</button>
              <Link to="/discovery" className="btn-ghost ml-auto">Continue to Discovery →</Link>
            </div>
          </section>

          <section className="card">
            <h2 className="h2">3. Observations ({observations.length})</h2>
            {observations.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Nothing recorded yet. Test a string above to begin.</p>
            ) : (
              <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full">
                  <thead className="sticky top-0"><tr><th className="th">#</th><th className="th">Input</th><th className="th">Result</th><th className="th">Source</th></tr></thead>
                  <tbody>
                    {[...observations].reverse().map((o, i) => (
                      <tr key={o.id}>
                        <td className="td text-slate-500">{observations.length - i}</td>
                        <td className="td mono font-semibold">{fmt(o.input)}</td>
                        <td className="td"><ResultBadge accepted={o.accepted} /></td>
                        <td className="td text-slate-600">{SOURCE_LABELS[o.source] ?? o.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
