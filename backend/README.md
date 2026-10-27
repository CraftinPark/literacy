# ReadCode backend

Python. FastAPI is the chosen web framework (not added yet). For now this folder holds the grader.

## Grader (`grader/`)

Scores a candidate submission (`schemas/submission.schema.json`) against an example's `key.json` and
returns a grading report (`schemas/grading-report.schema.json`).

| Layer | File | Uses an LLM? |
|---|---|---|
| 1. Where: match bug comments to key bugs by line (+/- 5) or function | `matcher.py` | no |
| 2. How well: score each answer/bug explanation/fix 0..1 | `judge.py` | yes (FakeJudge for now) |
| 3. Points: weights, 40/40/20 bug split, red-herring penalty, bonus cap | `score.py` | no |

The judge only returns per-item scores; it never adds up points. Its reply is schema-checked and rejected
if malformed. Blank answers score 0 whatever the judge says.

```
cd backend
../.venv/bin/python -m grader ../examples/readcode-001 tests/fixtures/readcode-001-strong.json
../.venv/bin/python -m grader ../examples/readcode-001 my-submission.json --json
```

**Judges.** `FakeJudge` is a word-overlap heuristic: free, offline, repeatable, and *not* a real quality
judge (paraphrases score low). A real LLM judge is a class with `name` and `judge(request) -> dict`;
`judge.build_prompt(request)` already produces its prompt. None is wired up yet: no free LLM was
available on this machine.

## Fix-and-quiz exercises (`fixquiz/`)

For exercises whose public.json has `"format": "fix_quiz"` (first one: `examples/readcode-004`). No LLM:
section 1 is graded by running the example's tests (visible and hidden) against the candidate's code,
section 2 by comparing multiple-choice answers with `key.json`.

| File | What it does |
|---|---|
| `runner.py` | Runs tests against any code tree in a temp folder; tests and pytest config always come from the example |
| `grade.py` | Scores both sections; diffs the candidate's code against the shipped code |
| `report.py` | One self-contained HTML report (includes the answer key) |
| `session.py` | Run tests / grade on the files the page's built-in editor sends (stateless) |
| `build.py` | Generates `code/` from the baseline and runs gate A, gate B and the fix checks into `manifest.json` |

```
cd backend
../.venv/Scripts/python -m fixquiz build ../examples/readcode-004          # after changing the example
../.venv/Scripts/python -m fixquiz grade ../examples/readcode-004 --code SOME_FOLDER --out report.html
```

(`.venv/bin/python` on macOS/Linux.) The exercise page reaches `session.py` through
`python -m fixquiz api ...`, spawned by the Vite dev server (`frontend/scripts/exam-api.mjs`) until the
FastAPI backend exists.

Tests: `pytest` from the repo root (see `pytest.ini`).
