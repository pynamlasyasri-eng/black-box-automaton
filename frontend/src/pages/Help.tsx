import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AutomatonDiagram from '../components/AutomatonDiagram';
import ModelSummary from '../components/ModelSummary';
import { PageHeader } from '../components/UI';
import type { DfaModel } from '../types';

// Example used on this page: strings over {a, b} that end with b.
const EXAMPLE: DfaModel = {
  alphabet: ['a', 'b'], states: ['q0', 'q1'], initial: 'q0', accepting: ['q1'],
  transitions: { q0: { a: 'q0', b: 'q1' }, q1: { a: 'q0', b: 'q1' } },
};

function Concept({ id, title, children, example, inApp }: { id: string; title: string; children: ReactNode; example?: ReactNode; inApp: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20">
      <h2 className="h2">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
      {example && <div className="mt-3 rounded-xl bg-indigo-50/70 p-3 text-sm text-slate-700"><span className="font-semibold text-indigo-800">Example: </span>{example}</div>}
      <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900"><span className="font-semibold">In this app: </span>{inApp}</div>
    </section>
  );
}

const M = ({ children }: { children: ReactNode }) => <code className="mono rounded bg-white px-1 font-semibold">{children}</code>;

export default function Help() {
  const toc: [string, string][] = [
    ['alphabet', 'Alphabet'], ['string', 'String'], ['language', 'Language'], ['dfa', 'DFA'], ['states', 'States & transitions'],
    ['accepting', 'Initial & accepting states'], ['regular', 'Regular languages'], ['membership', 'Membership queries'],
    ['inference', 'Automata inference'], ['validation', 'Counterexamples & validation'],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Learn & Help" subtitle="The theory behind the app in plain English, with a small example for each idea." />

      <nav className="card" aria-label="Contents">
        <div className="flex flex-wrap gap-2">
          {toc.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-100">{label}</a>)}
        </div>
      </nav>

      <Concept id="alphabet" title="Alphabet" example={<>Binary alphabet Σ = <M>{'{0, 1}'}</M>, or Σ = <M>{'{a, b}'}</M>.</>}
        inApp="Every mystery machine has a fixed alphabet. The Lab rejects any symbol that is not in it.">
        <p>An alphabet (written Σ) is a finite set of symbols. It is the “keyboard” a machine understands — nothing outside it can be typed in.</p>
      </Concept>

      <Concept id="string" title="String" example={<><M>0110</M> is a string over {'{0, 1}'} of length 4. The empty string, written <M>ε</M>, has length 0.</>}
        inApp="Each experiment is a series of strings you send to the black box. Leave the input box empty to send ε.">
        <p>A string is a finite sequence of symbols from the alphabet. Order matters: <M>01</M> and <M>10</M> are different strings.</p>
      </Concept>

      <Concept id="language" title="Language" example={<>L = “strings over {'{a, b}'} that end with b” contains <M>b</M>, <M>ab</M>, <M>aab</M> but not <M>ε</M> or <M>ba</M>.</>}
        inApp="Each mystery machine recognises one hidden language. Your job is to work out which one by testing strings.">
        <p>A language is a set of strings. A machine “recognises” a language by accepting exactly the strings that belong to it and rejecting all others.</p>
      </Concept>

      <Concept id="dfa" title="DFA (Deterministic Finite Automaton)"
        inApp="The hidden machines are DFAs, and so is every candidate the learner produces. They are written as (Q, Σ, δ, q₀, F).">
        <p>A DFA is the simplest kind of computer: it has a finite number of states, reads a string one symbol at a time, and moves between states by fixed rules. “Deterministic” means that from each state, each symbol leads to exactly one next state. After the last symbol, the DFA accepts if it is in an accepting state.</p>
        <p>Formally a DFA is a 5-tuple: Q (states), Σ (alphabet), δ (transition function), q₀ (initial state) and F (accepting states).</p>
      </Concept>

      <Concept id="states" title="States and transitions"
        inApp="The Visualizer draws states as circles and transitions as labelled arrows, and highlights the one being used as it reads your string.">
        <p>A state is the machine’s entire memory at a moment in time. A transition δ(q, x) = p says “in state q, on reading symbol x, go to state p”. Because the number of states is finite, a DFA can only remember a bounded amount — for example “is the count of 1s so far even or odd?”, but not “how many 1s exactly?”.</p>
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          <AutomatonDiagram dfa={EXAMPLE} caption="A two-state DFA for “ends with b”" />
          <ModelSummary dfa={EXAMPLE} />
        </div>
      </Concept>

      <Concept id="accepting" title="Initial and accepting states" example={<>In the diagram above, q0 is initial and q1 is accepting. The string <M>ab</M>: q0 →a→ q0 →b→ q1, ends in q1, so it is accepted.</>}
        inApp="A short arrow marks the initial state; a double circle marks an accepting state. The result badge ACCEPTED/REJECTED is decided by the state where the string ends.">
        <p>The initial state is where every run starts. Accepting (or final) states are the “yes” states. If the string ends anywhere else, it is rejected. Notice that the empty string is accepted exactly when the initial state is also accepting.</p>
      </Concept>

      <Concept id="regular" title="Regular languages"
        inApp="Everything the app can learn is regular — that is exactly what a finite automaton can represent.">
        <p>A language is regular if some DFA recognises it. Examples: “even number of 1s”, “ends with 01”, “contains aba”. Not regular: “equal numbers of 0s and 1s” — counting without a limit needs unbounded memory. Regular languages are also described by regular expressions and by NFAs, and all three are equivalent in power.</p>
      </Concept>

      <Concept id="membership" title="Membership queries" example={<>Ask “is <M>0101</M> in the language?” and receive ACCEPTED or REJECTED.</>}
        inApp="Every string you test in the Lab is a membership query, and the L* learner asks its own membership queries automatically. All answers are saved as observations.">
        <p>A membership query asks a black box about one string and returns a yes/no answer. It is the only window you have into a black box: you cannot see its states, only its answers.</p>
      </Concept>

      <Concept id="inference" title="Automata inference (learning)"
        inApp="Discovery offers Angluin’s L* (active: it chooses the queries) and passive state merging (works only with the observations you already have).">
        <p>Inference means building a model of an unknown machine from its behaviour. Angluin’s <strong>L*</strong> algorithm keeps an observation table: rows are prefixes, columns are test suffixes. Two prefixes that behave the same on all suffixes are treated as the same state. When the table is “closed” and “consistent”, it becomes a DFA, which is then checked for counterexamples.</p>
        <p><strong>Passive</strong> learning (RPNI) starts from a tree of all observed strings and merges states as long as no accepted and rejected string collide.</p>
        <p>Important limits: many different DFAs fit any finite set of observations, and a real black box cannot say “your model is exactly right”. So the result is a <em>candidate</em>, and this app approximates that check by testing.</p>
      </Concept>

      <Concept id="validation" title="Counterexamples and validation"
        inApp="Model Testing compares the candidate with the real black box on new strings. A mismatch is a counterexample — you can send it back to refine the model. Finally, ‘Reveal’ performs an exact equivalence check.">
        <p>A counterexample is a string on which the model and the black box disagree. It is the strongest possible feedback: it proves the model wrong and shows exactly where.</p>
        <p>Validation tests many strings (short ones, edge cases, random longer ones) and reports an agreement rate. 100% agreement is encouraging but is <strong>not a proof</strong> of equivalence — an untested string could still differ.</p>
      </Concept>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="h2">Ready to try it?</h2><p className="text-sm text-slate-600">Start with Machine Alpha or Delta (beginner level).</p></div>
        <Link to="/lab" className="btn-primary">Open the Black Box Lab</Link>
      </div>
    </div>
  );
}
