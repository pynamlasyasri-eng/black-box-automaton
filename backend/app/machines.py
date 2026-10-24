"""Registry of hidden "mystery" machines.

SECURITY NOTE: the transition tables below are the *secret* of the
application. They must never be serialised by an API route. Only `public()`
metadata is exposed during an experiment; `secret_rule` and the table are
released only through `blackbox.reveal()` after the user clicks "Reveal".

Machine ids are deliberately neutral (greek letters) so that they do not
leak the language they accept.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

from .dfa import DFA


def from_table(alphabet, table, initial, accepting) -> DFA:
    """Build a DFA from {state: (next-state-per-symbol, in alphabet order)}."""
    delta = {s: dict(zip(alphabet, targets)) for s, targets in table.items()}
    return DFA(tuple(alphabet), tuple(table), initial, frozenset(accepting), delta)


def substring_dfa(alphabet: Tuple[str, ...], pattern: str) -> DFA:
    """Accepts exactly the strings that contain `pattern` as a substring."""
    m = len(pattern)

    def step(k: int, c: str) -> int:
        if k == m:
            return m
        s = pattern[:k] + c
        for length in range(min(len(s), m), -1, -1):
            if s.endswith(pattern[:length]):
                return length
        return 0

    table = {f"s{k}": tuple(f"s{step(k, c)}" for c in alphabet) for k in range(m + 1)}
    return from_table(alphabet, table, "s0", [f"s{m}"])


@dataclass(frozen=True)
class MachineSpec:
    id: str
    name: str
    alphabet: Tuple[str, ...]
    difficulty: str
    secret_rule: str
    dfa: DFA  # SECRET - backend only

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "alphabet": list(self.alphabet),
            "difficulty": self.difficulty,
        }


def _build() -> List[MachineSpec]:
    b = ("0", "1")
    ab = ("a", "b")
    return [
        MachineSpec("alpha", "Machine Alpha", b, "Beginner",
                    "Binary strings containing an even number of 1s.",
                    from_table(b, {"E": ("E", "O"), "O": ("O", "E")}, "E", ["E"])),
        MachineSpec("beta", "Machine Beta", b, "Intermediate",
                    "Binary strings ending with 01.",
                    from_table(b, {"A": ("B", "A"), "B": ("B", "C"), "C": ("B", "A")}, "A", ["C"])),
        MachineSpec("gamma", "Machine Gamma", ab, "Intermediate",
                    "Strings over {a, b} that contain the substring aba.",
                    substring_dfa(ab, "aba")),
        MachineSpec("delta", "Machine Delta", ab, "Beginner",
                    "Strings over {a, b} whose number of a's is divisible by 3.",
                    from_table(ab, {"r0": ("r1", "r0"), "r1": ("r2", "r1"), "r2": ("r0", "r2")}, "r0", ["r0"])),
        MachineSpec("epsilon", "Machine Epsilon", b, "Intermediate",
                    "Binary strings that do not contain 11 as a substring.",
                    from_table(b, {"N": ("N", "S"), "S": ("N", "X"), "X": ("X", "X")}, "N", ["N", "S"])),
        MachineSpec("zeta", "Machine Zeta", b, "Advanced",
                    "Binary strings that, read as a binary number, are divisible by 3 (the empty string counts as 0).",
                    from_table(b, {"r0": ("r0", "r1"), "r1": ("r2", "r0"), "r2": ("r1", "r2")}, "r0", ["r0"])),
    ]


_REGISTRY: Dict[str, MachineSpec] = {m.id: m for m in _build()}


def list_specs() -> List[MachineSpec]:
    return list(_REGISTRY.values())


def get_spec(machine_id: str) -> MachineSpec:
    try:
        return _REGISTRY[machine_id]
    except KeyError:
        raise KeyError(f"Unknown machine {machine_id!r}") from None
