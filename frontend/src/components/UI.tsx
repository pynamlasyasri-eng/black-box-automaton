import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, text, actionLabel, to }: { title: string; text: string; actionLabel?: string; to?: string }) {
  return (
    <div className="card flex flex-col items-center py-12 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" className="mb-3 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="28" cy="28" r="20" /><circle cx="28" cy="28" r="14" strokeDasharray="3 4" />
      </svg>
      <h2 className="h2">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-600">{text}</p>
      {to && actionLabel && <Link to={to} className="btn-primary mt-4">{actionLabel}</Link>}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-indigo-700">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function ResultBadge({ accepted, large = false }: { accepted: boolean; large?: boolean }) {
  const size = large ? 'px-4 py-1.5 text-base' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-block rounded-full font-bold tracking-wide ${size} ${
      accepted ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
      {accepted ? 'ACCEPTED' : 'REJECTED'}
    </span>
  );
}

export function Badge({ children, tone = 'indigo' }: { children: ReactNode; tone?: 'indigo' | 'cyan' | 'amber' | 'green' | 'slate' | 'rose' }) {
  const tones = {
    indigo: 'bg-indigo-100 text-indigo-800', cyan: 'bg-cyan-100 text-cyan-800', amber: 'bg-amber-100 text-amber-900',
    green: 'bg-emerald-100 text-emerald-800', slate: 'bg-slate-100 text-slate-700', rose: 'bg-rose-100 text-rose-800',
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Notice({ tone, children }: { tone: 'warn' | 'info' | 'error'; children: ReactNode }) {
  const tones = {
    warn: 'border-amber-300 bg-amber-50 text-amber-900', info: 'border-cyan-300 bg-cyan-50 text-cyan-900',
    error: 'border-rose-300 bg-rose-50 text-rose-900',
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function ConfirmDialog(props: {
  open: boolean; title: string; message: string; confirmLabel: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { open, onCancel } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4" role="dialog" aria-modal="true" aria-label={props.title}>
      <div className="card w-full max-w-md animate-fadeUp">
        <h2 className="h2">{props.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{props.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={props.onCancel} disabled={props.busy}>Cancel</button>
          <button className="btn-danger" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy && <Spinner />}{props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NeedExperiment() {
  return (
    <EmptyState title="No experiment selected"
      text="Start an experiment in the Black Box Lab (or open one from History) to use this page."
      actionLabel="Go to the Lab" to="/lab" />
  );
}

export function NeedCandidate() {
  return (
    <EmptyState title="No candidate model yet"
      text="Collect some observations in the Lab, then run Automaton Discovery to infer a candidate DFA."
      actionLabel="Open Discovery" to="/discovery" />
  );
}
