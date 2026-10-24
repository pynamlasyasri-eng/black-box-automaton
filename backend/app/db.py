"""SQLite persistence for experiments, observations, candidates and validations."""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

SCHEMA = """
CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revealed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    input TEXT NOT NULL,
    accepted INTEGER NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (experiment_id, input)
);
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    params TEXT NOT NULL,
    dfa TEXT NOT NULL,
    info TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    total INTEGER NOT NULL,
    matches INTEGER NOT NULL,
    agreement REAL NOT NULL,
    results TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS counterexamples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    input TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (experiment_id, input)
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self, path: str):
        self.path = path
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_schema(self) -> None:
        with self._conn() as c:
            c.executescript(SCHEMA)

    # ---- experiments ------------------------------------------------------
    def create_experiment(self, machine_id: str, name: str) -> dict:
        with self._conn() as c:
            cur = c.execute("INSERT INTO experiments (machine_id, name, created_at) VALUES (?,?,?)",
                            (machine_id, name, _now()))
            return self._experiment(c, cur.lastrowid)

    def _experiment(self, c, exp_id: int) -> Optional[dict]:
        row = c.execute("SELECT * FROM experiments WHERE id=?", (exp_id,)).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["revealed"] = bool(d["revealed"])
        return d

    def get_experiment(self, exp_id: int) -> Optional[dict]:
        with self._conn() as c:
            return self._experiment(c, exp_id)

    def list_experiments(self) -> List[dict]:
        sql = """
        SELECT e.*,
          (SELECT COUNT(*) FROM observations o WHERE o.experiment_id = e.id) AS observation_count,
          (SELECT COUNT(*) FROM candidates c WHERE c.experiment_id = e.id) AS candidate_count,
          (SELECT COUNT(*) FROM validations v WHERE v.experiment_id = e.id) AS validation_count,
          (SELECT agreement FROM validations v WHERE v.experiment_id = e.id ORDER BY v.id DESC LIMIT 1)
              AS latest_agreement
        FROM experiments e ORDER BY e.id DESC"""
        with self._conn() as c:
            out = []
            for r in c.execute(sql):
                d = dict(r)
                d["revealed"] = bool(d["revealed"])
                out.append(d)
            return out

    def mark_revealed(self, exp_id: int) -> None:
        with self._conn() as c:
            c.execute("UPDATE experiments SET revealed=1 WHERE id=?", (exp_id,))

    def delete_experiment(self, exp_id: int) -> bool:
        with self._conn() as c:
            return c.execute("DELETE FROM experiments WHERE id=?", (exp_id,)).rowcount > 0

    def delete_all(self) -> int:
        with self._conn() as c:
            n = c.execute("SELECT COUNT(*) FROM experiments").fetchone()[0]
            c.execute("DELETE FROM experiments")
            return n

    # ---- observations -----------------------------------------------------
    @staticmethod
    def _obs(row) -> dict:
        d = dict(row)
        d["accepted"] = bool(d["accepted"])
        return d

    def get_observation(self, exp_id: int, text: str) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM observations WHERE experiment_id=? AND input=?",
                            (exp_id, text)).fetchone()
            return self._obs(row) if row else None

    def add_observation(self, exp_id: int, text: str, accepted: bool, source: str) -> Tuple[dict, bool]:
        with self._conn() as c:
            cur = c.execute("INSERT OR IGNORE INTO observations "
                            "(experiment_id, input, accepted, source, created_at) VALUES (?,?,?,?,?)",
                            (exp_id, text, int(accepted), source, _now()))
            row = c.execute("SELECT * FROM observations WHERE experiment_id=? AND input=?",
                            (exp_id, text)).fetchone()
            return self._obs(row), cur.rowcount == 1

    def list_observations(self, exp_id: int) -> List[dict]:
        with self._conn() as c:
            return [self._obs(r) for r in
                    c.execute("SELECT * FROM observations WHERE experiment_id=? ORDER BY id", (exp_id,))]

    # ---- candidates -------------------------------------------------------
    @staticmethod
    def _cand(row) -> dict:
        d = dict(row)
        for k in ("params", "dfa", "info"):
            d[k] = json.loads(d[k])
        return d

    def add_candidate(self, exp_id: int, method: str, params: dict, dfa: dict, info: dict) -> dict:
        with self._conn() as c:
            cur = c.execute("INSERT INTO candidates (experiment_id, method, params, dfa, info, created_at) "
                            "VALUES (?,?,?,?,?,?)",
                            (exp_id, method, json.dumps(params), json.dumps(dfa), json.dumps(info), _now()))
            return self._cand(c.execute("SELECT * FROM candidates WHERE id=?", (cur.lastrowid,)).fetchone())

    def get_candidate(self, cand_id: int) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM candidates WHERE id=?", (cand_id,)).fetchone()
            return self._cand(row) if row else None

    def list_candidates(self, exp_id: int) -> List[dict]:
        with self._conn() as c:
            return [self._cand(r) for r in
                    c.execute("SELECT * FROM candidates WHERE experiment_id=? ORDER BY id", (exp_id,))]

    # ---- validations ------------------------------------------------------
    @staticmethod
    def _val(row) -> dict:
        d = dict(row)
        d["results"] = json.loads(d["results"])
        return d

    def add_validation(self, exp_id: int, cand_id: int, summary: dict, results: list) -> dict:
        with self._conn() as c:
            cur = c.execute("INSERT INTO validations (experiment_id, candidate_id, total, matches, agreement, "
                            "results, created_at) VALUES (?,?,?,?,?,?,?)",
                            (exp_id, cand_id, summary["total"], summary["matches"], summary["agreement"],
                             json.dumps(results), _now()))
            return self._val(c.execute("SELECT * FROM validations WHERE id=?", (cur.lastrowid,)).fetchone())

    def list_validations(self, exp_id: int) -> List[dict]:
        with self._conn() as c:
            return [self._val(r) for r in
                    c.execute("SELECT * FROM validations WHERE experiment_id=? ORDER BY id", (exp_id,))]

    # ---- counterexamples --------------------------------------------------
    def add_counterexample(self, exp_id: int, text: str) -> None:
        with self._conn() as c:
            c.execute("INSERT OR IGNORE INTO counterexamples (experiment_id, input, created_at) VALUES (?,?,?)",
                      (exp_id, text, _now()))

    def list_counterexamples(self, exp_id: int) -> List[str]:
        with self._conn() as c:
            return [r["input"] for r in
                    c.execute("SELECT input FROM counterexamples WHERE experiment_id=? ORDER BY id", (exp_id,))]

    # ---- statistics -------------------------------------------------------
    def stats(self) -> Dict[str, int]:
        with self._conn() as c:
            one = lambda sql: c.execute(sql).fetchone()[0]
            return {
                "experiments": one("SELECT COUNT(*) FROM experiments"),
                "experiments_completed": one("SELECT COUNT(DISTINCT experiment_id) FROM validations"),
                "strings_tested": one("SELECT COUNT(*) FROM observations"),
                "candidate_models": one("SELECT COUNT(*) FROM candidates"),
                "validations": one("SELECT COUNT(*) FROM validations"),
            }
