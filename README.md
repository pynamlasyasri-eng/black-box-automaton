<<<<<<< HEAD
# Black Box Automaton

**An interactive web platform for finite-automata learning, inference and validation** — a Theory of Computation project.

A hidden DFA ("mystery machine") answers ACCEPTED / REJECTED for the strings you send it. From those observations the
app **infers a candidate DFA** (Angluin's L* or passive state merging), **draws it**, lets you **step through strings**,
and **validates it** against the real black box using fresh test strings and counterexamples.

> A learned automaton is a *candidate*, never a proof. Finitely many observations cannot show that two automata are
> identical. The app keeps this distinction explicit: only the final **Reveal** step performs an exact equivalence check.

## Features

| Area | What it does |
|---|---|
| Dashboard | Hero animation, live statistics from SQLite (experiments, strings tested, candidate models), how-it-works guide |
| Black Box Lab | 6 hidden machines, manual queries (empty string allowed), alphabet validation, bulk "query all strings up to length n", every query stored |
| Automaton Discovery | **L\*** (membership + equivalence queries, observation table) and **passive RPNI** state merging; explanation of how observations support the model; warnings and suggested queries when data is insufficient |
| Visualizer | SVG state diagram (circles, double circles for accepting states, start arrow, labelled arrows); step / back / play / pause / reset with current state and transition highlighted |
| Model Testing | Generated edge cases + all short strings + seeded random strings; actual vs predicted table; counterexamples highlighted; **refine** the model with a counterexample; agreement rate with a "not a proof" notice |
| Reveal | Secret rule + hidden minimal DFA, and an **exact** product-automaton equivalence check of every candidate |
| History | Saved experiments in SQLite: open, continue, delete one, delete all (with confirmation) |
| Learn & Help | Alphabet, string, language, DFA, states, initial/accepting, regular languages, membership queries, inference, counterexamples |

## Architecture

```
black-box-automaton/
├── backend/                     Python 3.10+ / FastAPI
│   ├── app/
│   │   ├── dfa.py               DFA class: run, trace, trim, minimise, shortest counterexample (product BFS)
│   │   ├── machines.py          SECRET hidden machines + public metadata (never serialised before reveal)
│   │   ├── blackbox.py          only gateway to the machines: query(), verify_equivalence(), reveal()
│   │   ├── learner.py           Angluin L*, bounded equivalence oracle, RPNI passive learner
│   │   ├── validation.py        test-string generation and candidate-vs-black-box comparison
│   │   ├── db.py                SQLite layer (experiments, observations, candidates, validations)
│   │   ├── services.py          application logic (no web code) – what is stored, revealed, refined
│   │   ├── main.py              FastAPI routes, CORS, optional static hosting of the built UI
│   │   └── config.py            environment-variable configuration (no secrets)
│   └── tests/                   unittest/pytest suites
└── frontend/                    React 18 + Vite + TypeScript + Tailwind CSS
    └── src/{pages,components,lib,api.ts,types.ts}
```

```
Browser (React) ──REST/JSON──► FastAPI routes ──► services.py ─┬─► blackbox.py ─► machines.py (secret DFAs)
                                                               ├─► learner.py (L*, RPNI) ─► dfa.py
                                                               ├─► validation.py
                                                               └─► db.py ─► SQLite (data/experiments.db)
```

**Why the secret stays secret:** the transition tables exist only in `machines.py`. API payloads contain
`id / name / alphabet / difficulty` only; ids are neutral Greek letters (not `even-ones`). The rule and table are
returned only by `POST /api/experiments/{id}/reveal`, which the user triggers explicitly.

**Technology choices.** The state diagram is drawn with a small custom SVG renderer instead of Graphviz: it needs no
system install on Windows, supports live highlighting during playback, and works offline.

## How the inference works

**L\* (Angluin 1987), `learner.lstar`.** Keeps a prefix-closed set `S` and suffix set `E`. A cell is the membership answer
for `prefix+suffix`. It repeatedly (1) makes the table *closed* (every row of `S·Σ` equals some row of `S`),
(2) makes it *consistent* (equal rows stay equal after any symbol), builds a hypothesis DFA (states = distinct rows),
and asks an equivalence query. Counterexamples add all their prefixes to `S`.

A true black box cannot answer equivalence queries, so the teacher (`bounded_equivalence`) is an **approximation**: it checks every
already-recorded observation, then every string up to length *k* (slider, default 4). The answer "no counterexample" therefore means
*none found*, not *none exist*. A weak *k* can yield a wrong candidate, which validation or a counterexample then repairs.

**Passive RPNI, `learner.rpni`.** Builds a prefix-tree acceptor from the labelled strings, then merges states in canonical order,
keeping a merge only if no accepted and rejected string end in the same state. Transitions never seen in the data are sent to a rejecting
dead state **and reported** as unobserved, with suggested strings to query. Strings from validation runs are held out as an independent
test set (unless promoted to counterexamples).

## Prerequisites (Windows)

* Python 3.10 or newer (`py --version`)
* Node.js 18 or newer (`node --version`) and npm

## Installation and running (Windows, two terminals)

**Terminal 1 – backend (PowerShell or cmd)**
```bat
cd black-box-automaton\backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API docs: http://127.0.0.1:8000/docs

**Terminal 2 – frontend**
```bat
cd black-box-automaton\frontend
npm install
npm run dev
```
Open http://localhost:5173 (the dev server proxies `/api` to port 8000).

Shortcut: double-click `run-backend.bat` and `run-frontend.bat` (the first run installs dependencies).
If PowerShell blocks `activate`, run `Set-ExecutionPolicy -Scope Process RemoteSigned` or use cmd.

## Tests

```bat
cd backend
.venv\Scripts\activate
pip install -r requirements-dev.txt
pytest -v
```
Without installing anything, the core suites run with the standard library only:
`python -m unittest discover -s tests -t . -v` (the HTTP tests in `test_api.py` are then skipped automatically).

Coverage: DFA acceptance, transitions and traces; every hidden machine against an independent Python predicate and expected
minimal size; shortest-counterexample property; L\* exactness for all machines, a deliberately weak teacher and its repair; closedness of the
observation table; RPNI consistency; sparse-data warnings; validation tables; refinement; reveal; history; cascade delete; secrecy of public payloads; HTTP flow.

Frontend type check: `cd frontend && npm run typecheck`.

## API summary (full interactive docs at `/docs`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/machines` | Public machine metadata only |
| GET | `/api/stats` | Dashboard counts |
| POST / GET | `/api/experiments` | Create / list experiments |
| GET / DELETE | `/api/experiments/{id}` | Full detail / delete one |
| DELETE | `/api/experiments?confirm=true` | Delete all history |
| POST | `/api/experiments/{id}/query` | Membership query `{input}` (empty string allowed) |
| POST | `/api/experiments/{id}/query-batch` | Up to 200 strings, all-or-nothing validation |
| POST | `/api/experiments/{id}/discover` | `{method: "lstar"\|"passive", max_test_len}` → candidate DFA |
| POST | `/api/experiments/{id}/refine` | `{candidate_id, counterexample}` → refined candidate |
| POST | `/api/experiments/{id}/candidates/{cid}/trace` | Step list for the visualizer |
| POST | `/api/experiments/{id}/validate` | Test a candidate against the black box |
| POST | `/api/experiments/{id}/reveal` | Secret rule, hidden minimal DFA, exact equivalence of each candidate |

Errors are JSON `{"detail": "..."}` with 404 (unknown id), 400 (not a counterexample, no data) or 422 (invalid string).

## Adding a new mystery DFA

Edit `backend/app/machines.py`, function `_build()`, and add a `MachineSpec`:

```python
MachineSpec("eta", "Machine Eta", ("a", "b"), "Intermediate",
            "Strings over {a, b} of even length.",
            from_table(("a", "b"), {"E": ("O", "O"), "O": ("E", "E")}, "E", ["E"]))
```
`from_table(alphabet, {state: (target on 1st symbol, target on 2nd symbol, ...)}, initial, accepting)` builds the DFA;
`substring_dfa(alphabet, "abab")` builds "contains a substring" machines. Use a neutral `id` (it is public).
Add `"eta": lambda w: len(w) % 2 == 0` to `ORACLES` and `"eta": 2` to `MINIMAL_STATES` in `tests/test_dfa.py`. Restart the server — the machine appears in the Lab.

## Deployment

**Single server (simplest).** Build the UI once, then FastAPI serves both API and UI:
```bat
cd frontend && npm install && npm run build
cd ..\backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open http://localhost:8000 (the `frontend/dist` folder is detected automatically; override with `BBA_FRONTEND_DIST`).

**Hosted (e.g. Render / Railway / a VPS).** Install `requirements.txt`; start command
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Put the database on a persistent disk and point `BBA_DB_PATH` at it
(SQLite on an ephemeral filesystem loses history on restart).

**Split hosting.** Build the frontend with `VITE_API_BASE=https://your-api.example.com npm run build`, host `dist/` on any static host, and set
`BBA_CORS_ORIGINS=https://your-frontend.example.com` on the API.

| Variable | Default | Meaning |
|---|---|---|
| `BBA_DB_PATH` | `backend/data/experiments.db` | SQLite file |
| `BBA_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins |
| `BBA_FRONTEND_DIST` | `frontend/dist` | Built UI served by the API if it exists |
| `VITE_API_BASE` | *(empty)* | Build-time API base URL for split hosting |

## Limitations (be upfront about these in the review)

* L\* needs an equivalence oracle; the black box has none, so equivalence is approximated by testing strings up to length *k* plus all recorded observations. A machine that differs only on longer strings can slip through. Only Reveal gives an exact verdict.
* Passive learning guarantees consistency with the data, not correctness; with few observations many DFAs fit.
* Only DFAs over small alphabets and inputs up to 64 symbols are supported (no NFAs, no Mealy machines).
* SQLite with one connection per request is ideal for a demo or a single user, not for heavy concurrent use.

## Demonstrating the project (suggested 8-minute flow)

1. **Dashboard** – explain the black-box idea and the "candidate ≠ proof" principle.
2. **Lab** – start *Machine Delta*, query `ε`, `a`, `aa`, `aaa`, `ab`, `baaab`; let the audience guess the rule.
3. **Discovery** – run **L\*** with k = 4; show the observation table, the states and the explanation. Point out the amber "not proven" badge.
4. **Visualizer** – step through `abaab`; show the highlighted transitions and the final verdict.
5. **Weak-model story** – start *Machine Gamma*, run L\* with **k = 1** (a too-small test depth), then **Model Testing**: mismatches appear. Click **Refine model with this** and re-validate to reach 100%.
6. **Reveal** – show the secret rule and that the refined model is *proven equivalent*, while the first one was not.
7. **Discovery (passive)** – on a fresh experiment query only 4–5 strings and run *Passive*: show the warning about unobserved transitions and the suggested queries.
8. **History** – open a past run, then show the delete confirmation.

Likely questions: *Why can't L\* be exact here?* (no equivalence oracle) · *Why is the learned DFA minimal?* (distinct rows = Myhill–Nerode classes) ·
*What is a counterexample?* · *Why are validation strings held out from passive learning?* (independent test set).
=======
# black-box-automaton
>>>>>>> 9b97f63a4b83948d28c24cd7c39d433c172303ca
