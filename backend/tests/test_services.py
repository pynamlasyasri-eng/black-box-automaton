"""End-to-end tests of the application logic with a real (temporary) SQLite file."""
import os
import tempfile
import unittest

from app.db import Database
from app.dfa import DFA, all_strings
from app.machines import get_spec
from app.services import BadRequest, ExperimentService, NotFound, Unprocessable
from app.validation import compare, generate_test_strings


class ServiceTestCase(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        db = Database(os.path.join(self._dir.name, "test.db"))
        db.init_schema()
        self.svc = ExperimentService(db)

    def tearDown(self):
        self._dir.cleanup()

    def new(self, machine="alpha"):
        return self.svc.create_experiment(machine, None)["id"]


class QueryTests(ServiceTestCase):
    def test_query_returns_label_and_persists(self):
        e = self.new()
        r = self.svc.query(e, "11")
        self.assertEqual((r["label"], r["new"]), ("ACCEPTED", True))
        self.assertEqual(self.svc.query(e, "1")["label"], "REJECTED")
        again = self.svc.query(e, "11")
        self.assertFalse(again["new"])
        self.assertEqual(again["observation_count"], 2)

    def test_empty_string_is_a_valid_query(self):
        e = self.new()
        self.assertEqual(self.svc.query(e, "")["label"], "ACCEPTED")  # 0 ones is even

    def test_invalid_symbols_and_unknown_ids(self):
        e = self.new()
        with self.assertRaises(Unprocessable):
            self.svc.query(e, "01a")
        with self.assertRaises(Unprocessable):
            self.svc.query(e, "0" * 65)
        with self.assertRaises(NotFound):
            self.svc.query(999, "0")
        with self.assertRaises(NotFound):
            self.svc.create_experiment("nope", None)

    def test_batch_is_all_or_nothing(self):
        e = self.new()
        with self.assertRaises(Unprocessable):
            self.svc.query_many(e, ["0", "1", "x"])
        self.assertEqual(self.svc.experiment_detail(e)["observations"], [])

    def test_secret_never_in_public_payloads_before_reveal(self):
        e = self.new()
        self.svc.query(e, "1")
        blob = str(self.svc.experiment_detail(e)) + str(self.svc.machines()) + str(self.svc.list_experiments())
        self.assertNotIn("even number", blob)
        self.assertNotIn("transitions", str(self.svc.machines()))
        self.assertNotIn("rule", self.svc.experiment_detail(e)["experiment"])


class DiscoveryTests(ServiceTestCase):
    def test_lstar_candidate_is_stored_and_marked_unproven(self):
        e = self.new("beta")
        cand = self.svc.discover(e, "lstar", 4)
        self.assertFalse(cand["info"]["proven"])
        self.assertEqual(len(cand["dfa"]["states"]), 3)
        self.assertTrue(cand["info"]["explanation"])
        self.assertTrue(any("does not prove" in w for w in cand["info"]["warnings"]))
        self.assertEqual(len(self.svc.experiment_detail(e)["candidates"]), 1)
        self.assertGreater(len(self.svc.experiment_detail(e)["observations"]), 0)

    def test_passive_with_no_data_asks_for_queries(self):
        e = self.new()
        with self.assertRaises(BadRequest):
            self.svc.discover(e, "passive")

    def test_passive_with_sparse_data_warns_and_suggests(self):
        e = self.new("gamma")
        for w in ("a", "ab", "b"):
            self.svc.query(e, w)
        cand = self.svc.discover(e, "passive")
        self.assertTrue(cand["info"]["warnings"])
        self.assertTrue(cand["info"]["suggestions"])
        observed = {o["input"] for o in self.svc.experiment_detail(e)["observations"]}
        self.assertTrue(all(s not in observed for s in cand["info"]["suggestions"]))

    def test_passive_with_rich_data_finds_exact_machine(self):
        e = self.new("epsilon")
        self.svc.query_many(e, list(all_strings(("0", "1"), 5)))
        cand = self.svc.discover(e, "passive")
        self.assertTrue(DFA.from_dict(cand["dfa"]).equivalent_to(get_spec("epsilon").dfa))
        self.assertEqual(cand["info"]["stats"]["observations_fit"], cand["info"]["stats"]["observations_total"])

    def test_unknown_method_rejected(self):
        with self.assertRaises(Unprocessable):
            self.svc.discover(self.new(), "magic")


class ValidationAndRefinementTests(ServiceTestCase):
    def test_validation_table_and_agreement(self):
        e = self.new("alpha")
        cand = self.svc.discover(e, "lstar", 4)
        v = self.svc.validate(e, cand["id"], max_len=5, n_random=20)
        self.assertEqual(v["summary"]["agreement"], 1.0)
        row = v["results"][0]
        self.assertEqual(set(row), {"input", "category", "actual", "predicted", "match",
                                    "actual_label", "predicted_label"})
        self.assertIn("edge", {r["category"] for r in v["results"]})
        self.assertIn("", [r["input"] for r in v["results"]])  # empty string is tested

    def test_mismatch_then_refine_improves_candidate(self):
        e = self.new("gamma")  # contains 'aba'
        weak = self.svc.discover(e, "lstar", 1)
        v = self.svc.validate(e, weak["id"], max_len=4, n_random=10)
        self.assertLess(v["summary"]["agreement"], 1.0)
        cex = v["counterexamples"][0]
        better = self.svc.refine(e, weak["id"], cex)
        self.assertEqual(better["info"]["refined_from"], weak["id"])
        self.assertGreater(len(better["dfa"]["states"]), len(weak["dfa"]["states"]))
        self.assertEqual(DFA.from_dict(better["dfa"]).accepts(cex), get_spec("gamma").dfa.accepts(cex))

    def test_refine_rejects_non_counterexample(self):
        e = self.new("alpha")
        cand = self.svc.discover(e, "lstar", 4)
        with self.assertRaises(BadRequest):
            self.svc.refine(e, cand["id"], "0110")

    def test_passive_refinement_promotes_validation_string(self):
        e = self.new("beta")
        self.svc.query_many(e, ["", "0", "1", "01", "11"])
        weak = self.svc.discover(e, "passive")
        v = self.svc.validate(e, weak["id"], max_len=4, n_random=5)
        if v["counterexamples"]:
            fixed = self.svc.refine(e, weak["id"], v["counterexamples"][0])
            self.assertEqual(DFA.from_dict(fixed["dfa"]).accepts(v["counterexamples"][0]),
                             get_spec("beta").dfa.accepts(v["counterexamples"][0]))

    def test_generator_is_deterministic_and_unique(self):
        a = generate_test_strings(("a", "b"), 4, 15, seed=3)
        b = generate_test_strings(("a", "b"), 4, 15, seed=3)
        self.assertEqual(a, b)
        self.assertEqual(len({w for w, _ in a}), len(a))

    def test_compare_flags_mismatches(self):
        truth = get_spec("alpha").dfa
        wrong = get_spec("beta").dfa
        results, summary = compare(wrong, truth.accepts, generate_test_strings(("0", "1"), 3, 0))
        self.assertGreater(summary["mismatches"], 0)
        self.assertAlmostEqual(summary["agreement"], summary["matches"] / summary["total"])
        self.assertTrue(all((not r["match"]) == (r["actual"] != r["predicted"]) for r in results))


class TraceRevealHistoryTests(ServiceTestCase):
    def test_trace(self):
        e = self.new("alpha")
        cand = self.svc.discover(e, "lstar", 3)
        t = self.svc.trace(e, cand["id"], "101")
        self.assertEqual(len(t["steps"]), 4)
        self.assertEqual(t["label"], "ACCEPTED")
        with self.assertRaises(Unprocessable):
            self.svc.trace(e, cand["id"], "2")

    def test_reveal_proves_or_refutes_candidates(self):
        e = self.new("gamma")
        weak = self.svc.discover(e, "lstar", 1)
        strong = self.svc.discover(e, "lstar", 5)
        out = self.svc.reveal(e)
        checks = {c["candidate_id"]: c for c in out["candidate_checks"]}
        self.assertFalse(checks[weak["id"]]["equivalent"])
        self.assertIsNotNone(checks[weak["id"]]["shortest_counterexample"])
        self.assertTrue(checks[strong["id"]]["equivalent"])
        self.assertEqual(out["minimal_states"], 4)
        self.assertIn("aba", out["rule"])
        self.assertTrue(self.svc.experiment_detail(e)["experiment"]["revealed"])

    def test_history_listing_stats_and_delete(self):
        e1, e2 = self.new("alpha"), self.new("beta")
        c = self.svc.discover(e1, "lstar", 3)
        self.svc.validate(e1, c["id"], 3, 0)
        listing = {x["id"]: x for x in self.svc.list_experiments()}
        self.assertEqual(listing[e1]["candidate_count"], 1)
        self.assertEqual(listing[e1]["latest_agreement"], 1.0)
        self.assertEqual(listing[e2]["observation_count"], 0)
        st = self.svc.stats()
        self.assertEqual((st["experiments"], st["experiments_completed"], st["candidate_models"]), (2, 1, 1))
        self.svc.delete_experiment(e1)
        with self.assertRaises(NotFound):
            self.svc.experiment_detail(e1)
        self.assertEqual(self.svc.stats()["candidate_models"], 0)  # cascade delete
        self.assertEqual(self.svc.delete_all(), 1)
        self.assertEqual(self.svc.list_experiments(), [])


if __name__ == "__main__":
    unittest.main()
