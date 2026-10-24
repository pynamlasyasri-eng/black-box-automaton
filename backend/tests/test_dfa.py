import unittest

from app.dfa import DFA, InvalidString, all_strings
from app.machines import from_table, get_spec, list_specs, substring_dfa

# Independent Python predicates for each hidden machine (the "ground truth").
ORACLES = {
    "alpha": lambda w: w.count("1") % 2 == 0,
    "beta": lambda w: w.endswith("01"),
    "gamma": lambda w: "aba" in w,
    "delta": lambda w: w.count("a") % 3 == 0,
    "epsilon": lambda w: "11" not in w,
    "zeta": lambda w: (int(w, 2) if w else 0) % 3 == 0,
}
MINIMAL_STATES = {"alpha": 2, "beta": 3, "gamma": 4, "delta": 3, "epsilon": 3, "zeta": 3}


class DFAAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.even_ones = get_spec("alpha").dfa

    def test_empty_string_accepted_when_initial_is_accepting(self):
        self.assertTrue(self.even_ones.accepts(""))

    def test_acceptance(self):
        self.assertTrue(self.even_ones.accepts("0110"))
        self.assertFalse(self.even_ones.accepts("0111"))

    def test_transitions_and_trace(self):
        steps = self.even_ones.trace("101")
        self.assertEqual([s["state"] for s in steps], ["E", "O", "O", "E"])
        self.assertEqual(steps[1]["from_state"], "E")
        self.assertEqual(steps[1]["symbol"], "1")

    def test_invalid_symbol_rejected(self):
        with self.assertRaises(InvalidString):
            self.even_ones.check_string("012")

    def test_incomplete_dfa_is_refused(self):
        with self.assertRaises(ValueError):
            DFA(("0", "1"), ("p",), "p", frozenset(), {"p": {"0": "p"}})

    def test_roundtrip_dict(self):
        d = DFA.from_dict(self.even_ones.to_dict())
        self.assertTrue(d.equivalent_to(self.even_ones))


class MachineTests(unittest.TestCase):
    def test_every_machine_matches_its_independent_oracle(self):
        for spec in list_specs():
            oracle = ORACLES[spec.id]
            for w in all_strings(spec.alphabet, 9):
                self.assertEqual(spec.dfa.accepts(w), oracle(w), f"{spec.id} on {w!r}")

    def test_machines_are_minimal_and_deterministic(self):
        for spec in list_specs():
            self.assertEqual(len(spec.dfa.minimized().states), MINIMAL_STATES[spec.id], spec.id)
            w = spec.alphabet[0] * 5 + spec.alphabet[1] * 3
            self.assertEqual({spec.dfa.accepts(w) for _ in range(5)}, {spec.dfa.accepts(w)})

    def test_at_least_five_machines_with_distinct_languages(self):
        specs = list_specs()
        self.assertGreaterEqual(len(specs), 5)
        for i, a in enumerate(specs):
            for b in specs[i + 1:]:
                if a.alphabet == b.alphabet:
                    self.assertFalse(a.dfa.equivalent_to(b.dfa), f"{a.id} == {b.id}")

    def test_public_metadata_never_leaks_secrets(self):
        for spec in list_specs():
            pub = spec.public()
            self.assertEqual(set(pub), {"id", "name", "alphabet", "difficulty"})
            blob = str(pub).lower()
            self.assertNotIn(spec.secret_rule.lower()[:12], blob)
            self.assertNotIn("transition", blob)

    def test_substring_builder(self):
        d = substring_dfa(("a", "b"), "abab")
        for w in all_strings(("a", "b"), 8):
            self.assertEqual(d.accepts(w), "abab" in w)


class EquivalenceTests(unittest.TestCase):
    def test_counterexample_is_shortest(self):
        ones = get_spec("alpha").dfa
        ends = get_spec("beta").dfa
        cex = ones.counterexample(ends)
        self.assertIsNotNone(cex)
        self.assertNotEqual(ones.accepts(cex), ends.accepts(cex))
        if cex:  # nothing shorter than the empty string
            for w in all_strings(("0", "1"), len(cex) - 1):
                self.assertEqual(ones.accepts(w), ends.accepts(w))

    def test_longer_shortest_counterexample(self):
        gamma, delta = get_spec("gamma").dfa, get_spec("gamma").dfa.minimized()
        self.assertIsNone(gamma.counterexample(delta))
        no11, ends = get_spec("epsilon").dfa, get_spec("beta").dfa
        cex = no11.counterexample(ends)
        for w in all_strings(("0", "1"), max(len(cex) - 1, 0)):
            if len(w) < len(cex):
                self.assertEqual(no11.accepts(w), ends.accepts(w))

    def test_equivalent_after_minimisation(self):
        for spec in list_specs():
            self.assertTrue(spec.dfa.equivalent_to(spec.dfa.minimized()))

    def test_redundant_states_are_merged(self):
        big = from_table(("0", "1"), {"x": ("y", "x"), "y": ("x", "y"), "z": ("x", "x")}, "x", ["x", "y"])
        self.assertEqual(len(big.minimized().states), 1)


if __name__ == "__main__":
    unittest.main()
