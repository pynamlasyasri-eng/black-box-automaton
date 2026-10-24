"""Deterministic finite automaton (DFA): simulation, minimisation, equivalence.

This module knows nothing about the web or the database. It is the
mathematical core shared by the hidden black-box machines, the learners and
the validation code.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from itertools import product
from typing import Dict, Iterator, List, Optional, Tuple


class InvalidString(ValueError):
    """A string contains a symbol that is not in the alphabet."""


def all_strings(alphabet: Tuple[str, ...], max_len: int) -> Iterator[str]:
    """Yield every string over `alphabet` of length 0..max_len in shortlex order."""
    yield ""
    for n in range(1, max_len + 1):
        for tup in product(alphabet, repeat=n):
            yield "".join(tup)


@dataclass
class DFA:
    """A complete DFA (M = (Q, Sigma, delta, q0, F)). `delta[state][symbol] -> state`."""

    alphabet: Tuple[str, ...]
    states: Tuple[str, ...]
    initial: str
    accepting: frozenset
    delta: Dict[str, Dict[str, str]]

    def __post_init__(self) -> None:
        self.alphabet = tuple(self.alphabet)
        self.states = tuple(self.states)
        self.accepting = frozenset(self.accepting)
        if not self.alphabet or any(len(a) != 1 for a in self.alphabet):
            raise ValueError("Alphabet must be a non-empty set of single characters")
        if len(set(self.alphabet)) != len(self.alphabet) or len(set(self.states)) != len(self.states):
            raise ValueError("Alphabet symbols and state names must be unique")
        if self.initial not in self.states:
            raise ValueError("Initial state is not a state of the automaton")
        if not self.accepting <= set(self.states):
            raise ValueError("Accepting states must be states of the automaton")
        for s in self.states:
            row = self.delta.get(s, {})
            for a in self.alphabet:
                if row.get(a) not in self.states:
                    raise ValueError(f"Missing or invalid transition for state {s!r} on {a!r}")

    # ---- simulation -------------------------------------------------------
    def check_string(self, text: str) -> None:
        for ch in text:
            if ch not in self.alphabet:
                raise InvalidString(
                    f"Symbol {ch!r} is not in the alphabet {{{', '.join(self.alphabet)}}}"
                )

    def run(self, text: str) -> str:
        state = self.initial
        for ch in text:
            state = self.delta[state][ch]
        return state

    def accepts(self, text: str) -> bool:
        return self.run(text) in self.accepting

    def trace(self, text: str) -> List[dict]:
        """Step list: step 0 is the start; step i>0 consumes text[i-1]."""
        self.check_string(text)
        steps = [{"step": 0, "symbol": None, "from_state": None, "state": self.initial}]
        state = self.initial
        for i, ch in enumerate(text, start=1):
            nxt = self.delta[state][ch]
            steps.append({"step": i, "symbol": ch, "from_state": state, "state": nxt})
            state = nxt
        return steps

    # ---- structure --------------------------------------------------------
    def trimmed(self) -> Tuple["DFA", Dict[str, str]]:
        """Drop unreachable states and rename the rest q0, q1, ... in BFS order."""
        order = [self.initial]
        seen = {self.initial}
        queue = deque([self.initial])
        while queue:
            s = queue.popleft()
            for a in self.alphabet:
                t = self.delta[s][a]
                if t not in seen:
                    seen.add(t)
                    order.append(t)
                    queue.append(t)
        names = {old: f"q{i}" for i, old in enumerate(order)}
        delta = {names[s]: {a: names[self.delta[s][a]] for a in self.alphabet} for s in order}
        dfa = DFA(self.alphabet, tuple(names[s] for s in order), names[self.initial],
                  frozenset(names[s] for s in order if s in self.accepting), delta)
        return dfa, names

    def minimized(self) -> "DFA":
        """Smallest equivalent DFA (partition refinement)."""
        d, _ = self.trimmed()
        part = {s: int(s in d.accepting) for s in d.states}
        while True:
            ids: Dict[tuple, int] = {}
            new = {}
            for s in d.states:
                sig = (part[s], tuple(part[d.delta[s][a]] for a in d.alphabet))
                new[s] = ids.setdefault(sig, len(ids))
            if len(ids) == len(set(part.values())):
                break
            part = new
        blocks = tuple(f"b{i}" for i in range(len(ids)))
        delta: Dict[str, Dict[str, str]] = {b: {} for b in blocks}
        for s in d.states:
            for a in d.alphabet:
                delta[f"b{new[s]}"][a] = f"b{new[d.delta[s][a]]}"
        q = DFA(d.alphabet, blocks, f"b{new[d.initial]}",
                frozenset(f"b{new[s]}" for s in d.accepting), delta)
        return q.trimmed()[0]

    def counterexample(self, other: "DFA") -> Optional[str]:
        """Shortest string on which the two DFAs disagree, or None if equivalent."""
        if self.alphabet != other.alphabet:
            raise ValueError("Cannot compare automata over different alphabets")
        start = (self.initial, other.initial)
        seen = {start}
        queue = deque([(start, "")])
        while queue:
            (p, q), word = queue.popleft()
            if (p in self.accepting) != (q in other.accepting):
                return word
            for a in self.alphabet:
                nxt = (self.delta[p][a], other.delta[q][a])
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append((nxt, word + a))
        return None

    def equivalent_to(self, other: "DFA") -> bool:
        return self.counterexample(other) is None

    def access_strings(self) -> Dict[str, str]:
        """Shortest string reaching each reachable state."""
        access = {self.initial: ""}
        queue = deque([self.initial])
        while queue:
            s = queue.popleft()
            for a in self.alphabet:
                t = self.delta[s][a]
                if t not in access:
                    access[t] = access[s] + a
                    queue.append(t)
        return access

    # ---- (de)serialisation ------------------------------------------------
    def to_dict(self) -> dict:
        return {
            "alphabet": list(self.alphabet),
            "states": list(self.states),
            "initial": self.initial,
            "accepting": sorted(self.accepting),
            "transitions": {s: dict(self.delta[s]) for s in self.states},
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DFA":
        return cls(tuple(data["alphabet"]), tuple(data["states"]), data["initial"],
                   frozenset(data["accepting"]), data["transitions"])
