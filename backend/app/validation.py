"""Test-string generation and comparison of a candidate DFA with the black box."""
from __future__ import annotations

import random
from typing import Callable, Iterable, List, Sequence, Tuple

from .dfa import DFA, all_strings


def generate_test_strings(alphabet: Sequence[str], max_len: int = 5, n_random: int = 30,
                          seed: int = 0, extra: Iterable[str] = ()) -> List[Tuple[str, str]]:
    """Return [(string, category)] with categories edge / short / random / custom.

    Deterministic for a given seed, so a validation run is reproducible.
    """
    alphabet = tuple(alphabet)
    out: List[Tuple[str, str]] = []
    seen = set()

    def add(w: str, cat: str) -> None:
        if w not in seen:
            seen.add(w)
            out.append((w, cat))

    add("", "edge")
    for a in alphabet:
        add(a, "edge")
        add(a * 8, "edge")
        add(a * 20, "edge")
    for i, a in enumerate(alphabet):
        for b in alphabet[i + 1:]:
            add((a + b) * 4, "edge")
            add((b + a) * 4, "edge")
            add(a * 4 + b * 4, "edge")
            add(b * 4 + a * 4, "edge")
            add((a + b) * 10 + a, "edge")
    for w in all_strings(alphabet, max_len):
        add(w, "short")
    rng = random.Random(seed)
    attempts = 0
    added = 0
    while added < n_random and attempts < n_random * 20:
        attempts += 1
        w = "".join(rng.choice(alphabet) for _ in range(rng.randint(max_len + 1, max_len + 10)))
        if w not in seen:
            add(w, "random")
            added += 1
    for w in extra:
        add(w, "custom")
    return out


def compare(candidate: DFA, actual: Callable[[str], bool],
            strings: Iterable[Tuple[str, str]]) -> Tuple[List[dict], dict]:
    """Compare candidate predictions with the black box on each string."""
    results = []
    for w, cat in strings:
        truth = actual(w)
        pred = candidate.accepts(w)
        results.append({"input": w, "category": cat, "actual": truth,
                        "predicted": pred, "match": truth == pred})
    total = len(results)
    matches = sum(r["match"] for r in results)
    summary = {"total": total, "matches": matches, "mismatches": total - matches,
               "agreement": (matches / total) if total else 0.0}
    return results, summary
