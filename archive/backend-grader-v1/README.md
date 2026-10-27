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

Tests: `pytest` from the repo root (see `pytest.ini`).
