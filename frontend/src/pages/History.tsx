import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../api';
import type { ExperimentDetail, ExperimentSummary } from '../types';
import AutomatonDiagram from '../components/AutomatonDiagram';
import { useExperiment } from '../components/ExperimentContext';
import { useToast } from '../components/Toast';
import { Badge, ConfirmDialog, EmptyState, Notice, PageHeader, ResultBadge, Spinner } from '../components/UI';
import { fmt, fmtDate, SOURCE_LABELS } from '../lib/strings';

export default function History() {
  const { currentId, select } = useExperiment();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<ExperimentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteAll, setDeleteAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.experiments().then((x) => { setItems(x); setError(null); }).catch((e) => setError(errMsg(e)));
  useEffect(() => { void refresh(); }, []);

  async function open(id: number) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setLoadingDetail(true);
    try { setDetail(await api.experiment(id)); } catch (e) { toast('error', errMsg(e)); setOpenId(null); } finally { setLoadingDetail(false); }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      if (deleteAll) {
        const r = await api.deleteAll();
        select(null);
        toast('success', `Deleted ${r.deleted} experiment(s).`);
      } else if (deleteId !== null) {
        await api.deleteExperiment(deleteId);
        if (deleteId === currentId) select(null);
        toast('success', 'Experiment deleted.');
      }
      setOpenId(null); setDetail(null); setDeleteId(null); setDeleteAll(false);
      await refresh();
    } catch (e) { toast('error', errMsg(e)); } finally { setBusy(false); }
  }

  const continueWith = (id: number) => { select(id); navigate('/lab'); };

  return (
    <div className="space-y-6">
      <PageHeader title="Experiment History" subtitle="Every experiment is stored in SQLite so you can review, continue or delete it later.">
        {items && items.length > 0 && <button className="btn-danger" onClick={() => setDeleteAll(true)}>Delete all history</button>}
      </PageHeader>

      {error && <Notice tone="error">{error}</Notice>}
      {!items && !error && <div className="flex items-center gap-2 text-sm text-slate-600"><Spinner />Loading…</div>}
      {items && items.length === 0 && <EmptyState title="No experiments yet" text="Your saved sessions will appear here." actionLabel="Start an experiment" to="/lab" />}

      {items && items.length > 0 && (
        <div className="space-y-4">
          {items.map((e) => (
            <section key={e.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="h2">{e.name} {e.id === currentId && <Badge tone="cyan">current</Badge>}</h2>
                  <p className="mt-1 text-sm text-slate-600">{e.machine.name} · {fmtDate(e.created_at)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="slate">{e.observation_count} observations</Badge>
                    <Badge tone="indigo">{e.candidate_count} candidates</Badge>
                    <Badge tone="slate">{e.validation_count} validations</Badge>
                    {e.latest_agreement != null && <Badge tone="green">latest agreement {(e.latest_agreement * 100).toFixed(1)}%</Badge>}
                    {e.revealed && <Badge tone="amber">revealed</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => void open(e.id)}>{openId === e.id ? 'Close' : 'Open'}</button>
                  <button className="btn-primary" onClick={() => continueWith(e.id)}>Continue</button>
                  <button className="btn-ghost text-rose-700 hover:bg-rose-50" onClick={() => setDeleteId(e.id)}>Delete</button>
                </div>
              </div>

              {openId === e.id && (
                <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
                  {loadingDetail || !detail ? <div className="flex items-center gap-2 text-sm"><Spinner />Loading…</div> : (
                    <>
                      {detail.experiment.rule
                        ? <Notice tone="info"><strong>Secret rule (revealed):</strong> {detail.experiment.rule}</Notice>
                        : <Notice tone="info">The rule of this machine has not been revealed.</Notice>}

                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-navy-900">Observations ({detail.observations.length})</h3>
                        <div className="max-h-60 overflow-auto rounded-xl border border-slate-200">
                          <table className="min-w-full">
                            <thead className="sticky top-0"><tr><th className="th">Input</th><th className="th">Result</th><th className="th">Source</th></tr></thead>
                            <tbody>
                              {detail.observations.map((o) => (
                                <tr key={o.id}><td className="td mono font-semibold">{fmt(o.input)}</td><td className="td"><ResultBadge accepted={o.accepted} /></td>
                                  <td className="td text-slate-600">{SOURCE_LABELS[o.source] ?? o.source}</td></tr>
                              ))}
                              {detail.observations.length === 0 && <tr><td className="td text-slate-500" colSpan={3}>No observations.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-navy-900">Candidate models ({detail.candidates.length})</h3>
                        {detail.candidates.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
                        <div className="space-y-3">
                          {detail.candidates.map((c) => {
                            const vals = detail.validations.filter((v) => v.candidate_id === c.id);
                            const lastVal = vals.length ? vals[vals.length - 1] : null;
                            return (
                              <details key={c.id} className="rounded-xl border border-slate-200 p-3">
                                <summary className="cursor-pointer text-sm font-semibold">
                                  Model #{c.id} · {c.dfa.states.length} states · {c.method === 'lstar' ? 'L*' : 'Passive'}
                                  {lastVal && <span className="ml-2 font-normal text-slate-600">validated: {(lastVal.agreement * 100).toFixed(1)}% on {lastVal.total} strings</span>}
                                </summary>
                                <div className="mt-3"><AutomatonDiagram dfa={c.dfa} /></div>
                                {lastVal && lastVal.results.some((r) => !r.match) && (
                                  <p className="mt-2 text-sm text-slate-700">Counterexamples: <span className="mono">{lastVal.results.filter((r) => !r.match).slice(0, 8).map((r) => fmt(r.input)).join(', ')}</span></p>
                                )}
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog open={deleteId !== null || deleteAll} busy={busy} confirmLabel={deleteAll ? 'Delete everything' : 'Delete experiment'}
        title={deleteAll ? 'Delete all history?' : 'Delete this experiment?'}
        message={deleteAll ? 'All experiments, observations, candidate models and validation results will be permanently removed.'
          : 'This experiment, its observations, candidate models and validations will be permanently removed.'}
        onConfirm={() => void confirmDelete()} onCancel={() => { setDeleteId(null); setDeleteAll(false); }} />
    </div>
  );
}
