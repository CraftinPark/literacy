# Archive (v1 format, not maintained)

Kept for reference after the pipeline was redefined (2026-10-26, see `docs/pipeline-design.md`).
Nothing here is run by `pytest`, the validator, or the frontend sync.

- `readcode-001/`: the LRU-cache example in the v1 format (C, 10 bugs, ASan/UBSan gates). Its runnable
  gate harness (`internal/verification/`) is the pattern to reuse if runnable checks come back.
- `backend-grader-v1/`: the grader scaffold (matcher, FakeJudge, scoring). It reads the v1 `key.json`
  (weights, comprehension/design sections) and v1 submissions (C#/D# answers).
- `schemas-v1/`: the v1 schemas those two were written against.

The frontend's C highlighter and outline tests still read `readcode-001/code/lru_cache.c` from here.
