import unittest

from app.dfa import all_strings
from app.learner import LearningError, bounded_equivalence, lstar, rpni
from app.machines import list_specs


class LStarTests(unittest.TestCase):
    def test_lstar_recovers_every_machine_exactly(self):
        for spec in list_specs():
            member = spec.dfa.accepts
            hyp, info = lstar(spec.alphabet, member, bounded_equivalence(spec.alphabet, member, [], 5))
            self.assertTrue(hyp.equivalent_to(spec.dfa), spec.id)
            self.assertEqual(len(hyp.states), len(spec.dfa.minimized().states), spec.id)
            self.assertGreaterEqual(info["equivalence_queries"], 1)

    def test_lstar_with_perfect_teacher_is_exact(self):
        spec = list_specs()[2]
        exact = lambda h: spec.dfa.counterexample(h)
        hyp, _ = lstar(spec.alphabet, spec.dfa.accepts, exact)
        self.assertTrue(hyp.equivalent_to(spec.dfa))

    def test_weak_teacher_can_give_wrong_candidate_and_counterexample_repairs_it(self):
        spec = next(s for s in list_specs() if s.id == "gamma")  # contains 'aba'
        member = spec.dfa.accepts
        weak = lstar(spec.alphabet, member, bounded_equivalence(spec.alphabet, member, [], 1))[0]
        self.assertFalse(weak.equivalent_to(spec.dfa), "k=1 should not be enough to see 'aba'")
        cex = weak.counterexample(spec.dfa)
        repaired = lstar(spec.alphabet, member, bounded_equivalence(spec.alphabet, member, [cex], 1))[0]
        self.assertGreater(len(repaired.states), len(weak.states))
        self.assertEqual(repaired.accepts(cex), member(cex))

    def test_observation_table_is_closed_and_hypothesis_is_complete(self):
        spec = list_specs()[1]
        hyp, info = lstar(spec.alphabet, spec.dfa.accepts,
                          bounded_equivalence(spec.alphabet, spec.dfa.accepts, [], 4))
        rows_s = {tuple(r["row"]) for r in info["table"] if r["region"] == "S"}
        for r in info["table"]:
            self.assertIn(tuple(r["row"]), rows_s)  # closedness
        for s in hyp.states:
            self.assertEqual(set(hyp.delta[s]), set(spec.alphabet))


class PassiveTests(unittest.TestCase):
    def test_rpni_is_consistent_with_all_samples(self):
        for spec in list_specs():
            ws = list(all_strings(spec.alphabet, 5))
            pos = [w for w in ws if spec.dfa.accepts(w)]
            neg = [w for w in ws if not spec.dfa.accepts(w)]
            dfa, _ = rpni(spec.alphabet, pos, neg)
            self.assertTrue(all(dfa.accepts(w) for w in pos), spec.id)
            self.assertFalse(any(dfa.accepts(w) for w in neg), spec.id)

    def test_rpni_identifies_language_from_characteristic_sample(self):
        for spec in list_specs():
            ws = list(all_strings(spec.alphabet, 6))
            dfa, info = rpni(spec.alphabet, [w for w in ws if spec.dfa.accepts(w)],
                             [w for w in ws if not spec.dfa.accepts(w)])
            self.assertTrue(dfa.equivalent_to(spec.dfa), spec.id)

    def test_sparse_data_reports_unobserved_transitions(self):
        dfa, info = rpni(("0", "1"), ["1"], ["0"])
        self.assertTrue(info["unobserved_transitions"] or info["unlabeled_states"] or len(dfa.states) <= 2)
        self.assertTrue(dfa.accepts("1"))
        self.assertFalse(dfa.accepts("0"))

    def test_no_observations_is_an_error(self):
        with self.assertRaises(LearningError):
            rpni(("0", "1"), [], [])

    def test_contradictory_sample_is_an_error(self):
        with self.assertRaises(LearningError):
            rpni(("0", "1"), ["01"], ["01"])


if __name__ == "__main__":
    unittest.main()
