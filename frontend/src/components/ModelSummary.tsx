import type { DfaModel } from '../types';
import { fmt } from '../lib/strings';

/** Formal 5-tuple plus transition table of a DFA. */
export default function ModelSummary({ dfa, access }: { dfa: DfaModel; access?: Record<string, string> }) {
  const acc = new Set(dfa.accepting);
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <div><dt className="inline font-semibold">States Q: </dt><dd className="mono inline">{'{'}{dfa.states.join(', ')}{'}'}</dd></div>
        <div><dt className="inline font-semibold">Alphabet Σ: </dt><dd className="mono inline">{'{'}{dfa.alphabet.join(', ')}{'}'}</dd></div>
        <div><dt className="inline font-semibold">Initial state q₀: </dt><dd className="mono inline">{dfa.initial}</dd></div>
        <div><dt className="inline font-semibold">Accepting states F: </dt><dd className="mono inline">{dfa.accepting.length ? `{${dfa.accepting.join(', ')}}` : '∅ (none)'}</dd></div>
      </dl>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="th">State</th>
              {access && <th className="th">Shortest string reaching it</th>}
              {dfa.alphabet.map((a) => <th key={a} className="th mono normal-case">δ(·, {a})</th>)}
            </tr>
          </thead>
          <tbody>
            {dfa.states.map((s) => (
              <tr key={s}>
                <td className="td mono font-semibold">
                  {s === dfa.initial ? '→ ' : ''}{acc.has(s) ? '(' + s + ')' : s}
                </td>
                {access && <td className="td mono">{fmt(access[s] ?? '')}</td>}
                {dfa.alphabet.map((a) => <td key={a} className="td mono">{dfa.transitions[s][a]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">→ marks the initial state; parentheses mark accepting states.</p>
    </div>
  );
}
