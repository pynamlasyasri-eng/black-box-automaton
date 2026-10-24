"""DFA inference algorithms.

1. `lstar`  - Angluin's L* (1987), the original observation-table version:
   * membership queries  -> ask the black box about a single string,
   * equivalence queries -> a *teacher* supplies a counterexample or says
     "no counterexample found".
   A real black box cannot answer equivalence queries exactly, so the
   teacher we plug in (`bounded_equivalence`) is only an *approximation*:
   it checks every recorded observation and every string up to length k.
   The learned DFA is therefore a CANDIDATE, never a proof.

2. `rpni`   - Passive learning (Oncina & Garcia, 1992) from a fixed set of
   labelled strings: build a prefix-tree acceptor and merge states while the
   labelled data stay consistent. It never asks new questions, so when the
   data are sparse it can only report which transitions it never observed.
"""
from __future__ import annotations

import copy
from collections import deque
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from .dfa import DFA, all_strings

Membership = Callable[[str], bool]
Equivalence = Callable[[DFA], Optional[str]]


class LearningError(Exception):
    pass


# ---------------------------------------------------------------------------
# Angluin's L*
# ---------------------------------------------------------------------------
def lstar(alphabet: Sequence[str], membership: Membership, equivalence: Equivalence,
          max_states: int = 40, max_rounds: int = 200) -> Tuple[DFA, dict]:
    """Learn a DFA. Returns (hypothesis, info). `info` documents the run."""
    alphabet = tuple(alphabet)
    S: List[str] = [""]          # prefix-closed set of access strings
    E: List[str] = [""]          # distinguishing suffixes (E[0] == "" -> acceptance)
    asked: Dict[str, bool] = {}  # local cache so each string is asked once
    eq_queries = 0

    def mq(word: str) -> bool:
        if word not in asked:
            asked[word] = membership(word)
        return asked[word]

    def row(prefix: str) -> Tuple[bool, ...]:
        return tuple(mq(prefix + e) for e in E)

    def find_unclosed() -> Optional[str]:
        rows_s = {row(s) for s in S}
        for s in S:
            for a in alphabet:
                if row(s + a) not in rows_s:
                    return s + a
        return None

    def find_inconsistency() -> Optional[str]:
        for i, s1 in enumerate(S):
            for s2 in S[i + 1:]:
                if row(s1) != row(s2):
                    continue
                for a in alphabet:
                    r1, r2 = row(s1 + a), row(s2 + a)
                    if r1 != r2:
                        k = next(j for j in range(len(E)) if r1[j] != r2[j])
                        return a + E[k]
        return None

    def build() -> Tuple[DFA, Dict[str, str]]:
        names: Dict[Tuple[bool, ...], str] = {}
        access: Dict[str, str] = {}
        for s in S:
            r = row(s)
            if r not in names:
                names[r] = f"q{len(names)}"
                access[names[r]] = s
        delta = {names[row(s)]: {a: names[row(s + a)] for a in alphabet}
                 for s in (access[n] for n in names.values())}
        dfa = DFA(alphabet, tuple(names.values()), names[row("")],
                  frozenset(n for r, n in names.items() if r[0]), delta)
        return dfa, access

    rounds: List[dict] = []
    for _ in range(max_rounds):
        while True:
            unclosed = find_unclosed()
            if unclosed is not None:
                S.append(unclosed)
                continue
            suffix = find_inconsistency()
            if suffix is not None:
                E.append(suffix)
                continue
            break
        hypothesis, access = build()
        if len(hypothesis.states) > max_states:
            raise LearningError(f"Hypothesis exceeded {max_states} states; stopping.")
        eq_queries += 1
        cex = equivalence(hypothesis)
        rounds.append({"states": len(hypothesis.states), "prefixes": len(S),
                       "suffixes": len(E), "counterexample": cex})
        if cex is None:
            table = [{"prefix": s, "row": [int(x) for x in row(s)], "region": "S"} for s in S]
            seen_s = set(S)
            for s in S:
                for a in alphabet:
                    if s + a not in seen_s:
                        seen_s.add(s + a)
                        table.append({"prefix": s + a, "row": [int(x) for x in row(s + a)], "region": "S.A"})
            info = {"suffixes": list(E), "table": table, "access": access,
                    "membership_queries": len(asked), "equivalence_queries": eq_queries,
                    "rounds": rounds}
            return hypothesis, info
        for i in range(len(cex) + 1):       # Angluin: add every prefix of the counterexample
            if cex[:i] not in S:
                S.append(cex[:i])
    raise LearningError("L* did not converge within the round limit.")


def bounded_equivalence(alphabet: Sequence[str], membership: Membership,
                        known: Iterable[str], max_len: int) -> Equivalence:
    """Approximate equivalence oracle.

    1. Check strings whose labels are already known (free - no new queries).
    2. Query every string of length <= max_len (shortlex order).
    Returns the first disagreement, or None. None does NOT prove equivalence.
    """
    known = sorted(set(known), key=lambda w: (len(w), w))

    def oracle(hyp: DFA) -> Optional[str]:
        for w in known:
            if hyp.accepts(w) != membership(w):
                return w
        for w in all_strings(tuple(alphabet), max_len):
            if hyp.accepts(w) != membership(w):
                return w
        return None

    return oracle


# ---------------------------------------------------------------------------
# Passive learning: RPNI state merging
# ---------------------------------------------------------------------------
def _fold(trans: dict, label: dict, r: int, b: int) -> bool:
    if label[b] is not None:
        if label[r] is None:
            label[r] = label[b]
        elif label[r] != label[b]:
            return False
    for a, child in list(trans[b].items()):
        if a in trans[r]:
            if not _fold(trans, label, trans[r][a], child):
                return False
        else:
            trans[r][a] = child
    return True


def rpni(alphabet: Sequence[str], positives: Iterable[str], negatives: Iterable[str]) -> Tuple[DFA, dict]:
    """Infer a DFA consistent with the labelled sample by state merging."""
    alphabet = tuple(alphabet)
    pos, neg = set(positives), set(negatives)
    if not pos and not neg:
        raise LearningError("There are no observations yet. Query the black box first.")
    if pos & neg:
        raise LearningError("The same string is labelled both accepted and rejected.")

    prefixes = {w[:i] for w in pos | neg for i in range(len(w) + 1)}
    order = sorted(prefixes, key=lambda w: (len(w), w))
    ident = {w: i for i, w in enumerate(order)}
    trans: Dict[int, Dict[str, int]] = {i: {} for i in ident.values()}
    label: Dict[int, Optional[bool]] = {i: None for i in ident.values()}
    for w in order:
        if w:
            trans[ident[w[:-1]]][w[-1]] = ident[w]
        if w in pos:
            label[ident[w]] = True
        elif w in neg:
            label[ident[w]] = False

    red: List[int] = [0]

    def blue_states() -> List[int]:
        out = set()
        for r in red:
            for t in trans[r].values():
                if t not in red:
                    out.add(t)
        return sorted(out)

    merges = 0
    blue = blue_states()
    while blue:
        b = blue[0]
        parent = next((r, a) for r in red for a, t in trans[r].items() if t == b)
        merged = False
        for r in red:
            t2, l2 = copy.deepcopy(trans), dict(label)
            t2[parent[0]][parent[1]] = r
            if _fold(t2, l2, r, b):
                trans, label = t2, l2
                merged = True
                merges += 1
                break
        if not merged:
            red.append(b)
        blue = blue_states()

    # Assemble the DFA over the red states; complete it with a rejecting sink.
    unobserved: List[Tuple[int, str]] = [(r, a) for r in red for a in alphabet if a not in trans[r]]
    unlabeled = [r for r in red if label[r] is None]
    names = {r: f"r{r}" for r in red}
    sink = "dead"
    delta = {names[r]: {a: (names[trans[r][a]] if a in trans[r] else sink) for a in alphabet} for r in red}
    states = [names[r] for r in red]
    if unobserved:
        delta[sink] = {a: sink for a in alphabet}
        states.append(sink)
    raw = DFA(alphabet, tuple(states), names[0],
              frozenset(names[r] for r in red if label[r]), delta)
    dfa, rename = raw.trimmed()
    info = {
        "positives": len(pos), "negatives": len(neg), "pta_states": len(order), "merges": merges,
        "unobserved_transitions": [{"state": rename[names[r]], "symbol": a} for r, a in unobserved
                                   if names[r] in rename],
        "unlabeled_states": [rename[names[r]] for r in unlabeled if names[r] in rename],
        "sink_added": bool(unobserved) and sink in rename,
        "sink_state": rename.get(sink),
    }
    info["access"] = dfa.access_strings()
    return dfa, info
