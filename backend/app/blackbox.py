"""The black box: the only code allowed to evaluate the hidden machines.

Learners and routes talk to a machine through `query()` (a membership query)
and see only ACCEPTED / REJECTED. `reveal()` is the single place where the
secret rule and table are released.
"""
from __future__ import annotations

from typing import List, Optional

from .dfa import DFA, InvalidString
from .machines import get_spec, list_specs

MAX_INPUT_LENGTH = 64


def public_machines() -> List[dict]:
    return [m.public() for m in list_specs()]


def validate_input(machine_id: str, text: str) -> str:
    spec = get_spec(machine_id)
    if not isinstance(text, str):
        raise InvalidString("Input must be a string")
    if len(text) > MAX_INPUT_LENGTH:
        raise InvalidString(f"Input is too long (maximum {MAX_INPUT_LENGTH} symbols)")
    spec.dfa.check_string(text)
    return text


def query(machine_id: str, text: str) -> bool:
    """Membership query: does the hidden machine accept `text`?"""
    validate_input(machine_id, text)
    return get_spec(machine_id).dfa.accepts(text)


def verify_equivalence(machine_id: str, candidate: DFA) -> Optional[str]:
    """Exact check against the hidden machine (used only after reveal)."""
    return get_spec(machine_id).dfa.counterexample(candidate)


def reveal(machine_id: str) -> dict:
    spec = get_spec(machine_id)
    minimal = spec.dfa.minimized()
    return {"rule": spec.secret_rule, "minimal_dfa": minimal.to_dict()}
