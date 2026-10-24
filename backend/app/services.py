"""Application logic that ties the black box, learners, validation and database together.

Routes stay thin: every rule (what counts as a counterexample, what is stored,
what is revealed) lives here so it can be unit-tested without a web server.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from . import blackbox
from .db import Database
from .dfa import DFA, InvalidString
from .learner import LearningError, bounded_equivalence, lstar, rpni
from .machines import get_spec
from .validation import compare, generate_test_strings

METHODS = ("lstar", "passive")
MAX_BATCH = 200
EPS = "\u03b5"  # epsilon: how the empty string is displayed


class ServiceError(Exception):
    status = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(ServiceError):
    status = 404


class BadRequest(ServiceError):
    status = 400


class Unprocessable(ServiceError):
    status = 422


def _label(accepted: bool) -> str:
    return "ACCEPTED" if accepted else "REJECTED"


class ExperimentService:
    def __init__(self, db: Database):
        self.db = db

    # ---- lookups ----------------------------------------------------------
    def _exp(self, exp_id: int) -> dict:
        exp = self.db.get_experiment(exp_id)
        if exp is None:
            raise NotFound(f"Experiment {exp_id} does not exist")
        return exp

    def _cand(self, exp_id: int, cand_id: int) -> dict:
        cand = self.db.get_candidate(cand_id)
        if cand is None or cand["experiment_id"] != exp_id:
            raise NotFound(f"Candidate model {cand_id} does not exist in experiment {exp_id}")
        return cand

    # ---- machines & experiments ------------------------------------------
    def machines(self) -> List[dict]:
        return blackbox.public_machines()

    def create_experiment(self, machine_id: str, name: Optional[str]) -> dict:
        try:
            spec = get_spec(machine_id)
        except KeyError:
            raise NotFound(f"Unknown machine {machine_id!r}")
        n = len(self.db.list_experiments()) + 1
        exp = self.db.create_experiment(machine_id, (name or "").strip() or f"{spec.name} experiment #{n}")
        return self._public_experiment(exp)

    def _public_experiment(self, exp: dict) -> dict:
        spec = get_spec(exp["machine_id"])
        out = {"id": exp["id"], "name": exp["name"], "created_at": exp["created_at"],
               "revealed": exp["revealed"], "machine": spec.public()}
        if exp["revealed"]:
            out["rule"] = spec.secret_rule
        return out

    def list_experiments(self) -> List[dict]:
        out = []
        for e in self.db.list_experiments():
            item = self._public_experiment(e)
            for k in ("observation_count", "candidate_count", "validation_count", "latest_agreement"):
                item[k] = e[k]
            out.append(item)
        return out

    def experiment_detail(self, exp_id: int) -> dict:
        exp = self._exp(exp_id)
        return {
            "experiment": self._public_experiment(exp),
            "observations": [self._obs_out(o) for o in self.db.list_observations(exp_id)],
            "candidates": self.db.list_candidates(exp_id),
            "validations": self.db.list_validations(exp_id),
            "counterexamples": self.db.list_counterexamples(exp_id),
        }

    def delete_experiment(self, exp_id: int) -> None:
        if not self.db.delete_experiment(exp_id):
            raise NotFound(f"Experiment {exp_id} does not exist")

    def delete_all(self) -> int:
        return self.db.delete_all()

    def stats(self) -> dict:
        return self.db.stats()

    @staticmethod
    def _obs_out(o: dict) -> dict:
        return {"id": o["id"], "input": o["input"], "accepted": o["accepted"],
                "label": _label(o["accepted"]), "source": o["source"], "created_at": o["created_at"]}

    # ---- membership queries ----------------------------------------------
    def _observe(self, exp: dict, text: str, source: str):
        """Ask the black box (once per distinct string). Returns (accepted, is_new)."""
        try:
            blackbox.validate_input(exp["machine_id"], text)
        except InvalidString as e:
            raise Unprocessable(str(e))
        known = self.db.get_observation(exp["id"], text)
        if known is not None:
            return known["accepted"], False
        accepted = blackbox.query(exp["machine_id"], text)
        self.db.add_observation(exp["id"], text, accepted, source)
        return accepted, True

    def query(self, exp_id: int, text: str, source: str = "manual") -> dict:
        exp = self._exp(exp_id)
        accepted, is_new = self._observe(exp, text, source)
        return {"input": text, "accepted": accepted, "label": _label(accepted), "new": is_new,
                "observation_count": len(self.db.list_observations(exp_id))}

    def query_many(self, exp_id: int, inputs: List[str]) -> dict:
        exp = self._exp(exp_id)
        if len(inputs) > MAX_BATCH:
            raise Unprocessable(f"At most {MAX_BATCH} strings can be queried at once")
        for text in inputs:  # validate everything first so a batch is all-or-nothing
            try:
                blackbox.validate_input(exp["machine_id"], text)
            except InvalidString as e:
                raise Unprocessable(f"{text!r}: {e}")
        results = []
        for text in inputs:
            accepted, is_new = self._observe(exp, text, "manual")
            results.append({"input": text, "accepted": accepted, "label": _label(accepted), "new": is_new})
        return {"results": results, "observation_count": len(self.db.list_observations(exp_id))}

    # ---- discovery --------------------------------------------------------
    def discover(self, exp_id: int, method: str, max_test_len: int = 4,
                 refined_from: Optional[int] = None) -> dict:
        exp = self._exp(exp_id)
        if method not in METHODS:
            raise Unprocessable(f"Unknown method {method!r}; choose one of {', '.join(METHODS)}")
        spec = get_spec(exp["machine_id"])
        alphabet = spec.alphabet
        before = len(self.db.list_observations(exp_id))
        try:
            if method == "lstar":
                dfa, info = self._run_lstar(exp, alphabet, max_test_len)
            else:
                dfa, info = self._run_passive(exp, alphabet)
        except LearningError as e:
            raise BadRequest(str(e))
        observations = self.db.list_observations(exp_id)
        fit = sum(dfa.accepts(o["input"]) == o["accepted"] for o in observations)
        info["stats"] = {
            "states": len(dfa.states), "observations_total": len(observations),
            "observations_fit": fit, "new_queries": len(observations) - before,
        }
        info["proven"] = False
        info["refined_from"] = refined_from
        info["explanation"], info["warnings"], info["suggestions"] = self._explain(
            method, dfa, info, max_test_len, {o["input"] for o in observations})
        params = {"max_test_len": max_test_len} if method == "lstar" else {}
        return self.db.add_candidate(exp_id, method, params, dfa.to_dict(), info)

    def _run_lstar(self, exp: dict, alphabet, max_test_len: int):
        def membership(w: str) -> bool:
            return self._observe(exp, w, "lstar")[0]

        def eq_membership(w: str) -> bool:
            return self._observe(exp, w, "lstar-test")[0]

        known = [o["input"] for o in self.db.list_observations(exp["id"])]
        oracle = bounded_equivalence(alphabet, eq_membership, known, max_test_len)
        dfa, info = lstar(alphabet, membership, oracle)
        info["max_test_len"] = max_test_len
        return dfa, info

    def _run_passive(self, exp: dict, alphabet):
        promoted = set(self.db.list_counterexamples(exp["id"]))
        # Validation strings are held out as an independent test set, unless the
        # user promoted one of them to a counterexample.
        train = [o for o in self.db.list_observations(exp["id"])
                 if o["source"] != "validation" or o["input"] in promoted]
        return rpni(alphabet, [o["input"] for o in train if o["accepted"]],
                    [o["input"] for o in train if not o["accepted"]])

    @staticmethod
    def _explain(method: str, dfa: DFA, info: dict, max_test_len: int, observed: set):
        stats, access = info["stats"], info["access"]
        n = len(dfa.states)
        rep = ", ".join(f"{s} = {(EPS if access[s] == '' else repr(access[s]))}" for s in dfa.states if s in access)
        explanation: List[str] = []
        warnings: List[str] = []
        suggestions: List[str] = []
        if method == "lstar":
            explanation += [
                f"L* asked {info['membership_queries']} membership queries and filled an observation table with "
                f"{len([r for r in info['table'] if r['region'] == 'S'])} prefixes (rows) and "
                f"{len(info['suffixes'])} distinguishing suffixes (columns).",
                f"Two prefixes become the same state exactly when they behave identically on every suffix in the table. "
                f"The {n} state(s) are represented by the shortest prefix found for each: {rep}.",
                f"{info['equivalence_queries']} equivalence round(s) were run. The black box cannot answer equivalence "
                f"queries exactly, so each round checked every recorded observation plus every string of length "
                f"\u2264 {max_test_len}; the final model survived all of them.",
                f"The model agrees with {stats['observations_fit']} of {stats['observations_total']} recorded observations.",
            ]
            if max_test_len < 2 * n:
                warnings.append(
                    f"The test length k={max_test_len} is small compared with the model size ({n} states). A larger "
                    f"machine can agree on short strings and still differ on longer ones \u2014 raise k or run validation.")
        else:
            explanation += [
                f"A prefix tree of {info['pta_states']} states was built from {info['positives']} accepted and "
                f"{info['negatives']} rejected strings, then states were merged ({info['merges']} merges) as long as no "
                f"accepted and rejected string ended in the same state.",
                f"The result has {n} state(s): {rep}.",
                f"It reproduces {stats['observations_fit']} of {stats['observations_total']} recorded observations "
                f"(validation strings are held out unless promoted to counterexamples).",
            ]
            missing = info["unobserved_transitions"]
            if missing:
                warnings.append(
                    f"{len(missing)} transition(s) were never observed; they were sent to a rejecting dead state only "
                    f"to make the DFA complete. Those parts of the model are guesses.")
                for m in missing:
                    w = access.get(m["state"], "") + m["symbol"]
                    if w not in observed and len(suggestions) < 8:
                        suggestions.append(w)
            for q in info["unlabeled_states"]:
                w = access.get(q, "")
                if w not in observed and w not in suggestions and len(suggestions) < 8:
                    suggestions.append(w)
            if info["unlabeled_states"]:
                warnings.append(f"State(s) {', '.join(info['unlabeled_states'])} never had a labelled string end in "
                                f"them, so their accepting status is assumed to be REJECTED.")
            if stats["observations_total"] < 8:
                warnings.append("Very few observations are available. Many different DFAs fit such a small sample.")
                if not suggestions:
                    suggestions += [w for w in ("", "0", "1", "a", "b", "00", "01", "10", "11") if w not in observed][:6]
        warnings.append("This is a candidate model. Agreement with finitely many observations does not prove that "
                        "it is equivalent to the black box.")
        return explanation, warnings, suggestions

    # ---- refinement -------------------------------------------------------
    def refine(self, exp_id: int, cand_id: int, counterexample: str) -> dict:
        exp = self._exp(exp_id)
        cand = self._cand(exp_id, cand_id)
        accepted, _ = self._observe(exp, counterexample, "counterexample")
        dfa = DFA.from_dict(cand["dfa"])
        if dfa.accepts(counterexample) == accepted:
            raise BadRequest(f"{counterexample or EPS!r} is not a counterexample: the candidate and the "
                             f"black box both {_label(accepted)} it.")
        self.db.add_counterexample(exp_id, counterexample)
        return self.discover(exp_id, cand["method"], cand["params"].get("max_test_len", 4), refined_from=cand_id)

    # ---- visualiser trace -------------------------------------------------
    def trace(self, exp_id: int, cand_id: int, text: str) -> dict:
        cand = self._cand(exp_id, cand_id)
        dfa = DFA.from_dict(cand["dfa"])
        try:
            steps = dfa.trace(text)
        except InvalidString as e:
            raise Unprocessable(str(e))
        accepted = steps[-1]["state"] in dfa.accepting
        return {"input": text, "steps": steps, "accepted": accepted, "label": _label(accepted)}

    # ---- validation -------------------------------------------------------
    def validate(self, exp_id: int, cand_id: int, max_len: int = 5, n_random: int = 30,
                 extra_inputs: Optional[List[str]] = None) -> dict:
        exp = self._exp(exp_id)
        cand = self._cand(exp_id, cand_id)
        spec = get_spec(exp["machine_id"])
        extra = list(extra_inputs or [])
        for w in extra:
            try:
                blackbox.validate_input(exp["machine_id"], w)
            except InvalidString as e:
                raise Unprocessable(f"{w!r}: {e}")
        dfa = DFA.from_dict(cand["dfa"])
        strings = generate_test_strings(spec.alphabet, max_len, n_random, seed=exp_id * 1000 + cand_id, extra=extra)
        results, summary = compare(dfa, lambda w: self._observe(exp, w, "validation")[0], strings)
        for r in results:
            r["actual_label"], r["predicted_label"] = _label(r["actual"]), _label(r["predicted"])
        row = self.db.add_validation(exp_id, cand_id, summary, results)
        return {**row, "summary": summary, "counterexamples": [r["input"] for r in results if not r["match"]]}

    # ---- reveal -----------------------------------------------------------
    def reveal(self, exp_id: int) -> dict:
        exp = self._exp(exp_id)
        self.db.mark_revealed(exp_id)
        info = blackbox.reveal(exp["machine_id"])
        checks = []
        for cand in self.db.list_candidates(exp_id):
            dfa = DFA.from_dict(cand["dfa"])
            cex = blackbox.verify_equivalence(exp["machine_id"], dfa)
            checks.append({"candidate_id": cand["id"], "method": cand["method"],
                           "candidate_states": len(dfa.states), "equivalent": cex is None,
                           "shortest_counterexample": cex})
        return {"rule": info["rule"], "minimal_dfa": info["minimal_dfa"],
                "minimal_states": len(info["minimal_dfa"]["states"]), "candidate_checks": checks}
