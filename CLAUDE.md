# CLAUDE.md: ReadCode

Read this whole file before writing code. It is the hand-off from the design conversation that produced everything in this repo.

## 1. What this project is

**ReadCode** is a web app for interview prep and skill-building, a "LeetCode in reverse". Instead of asking users to *write* a solution, it shows them a real piece of code (200-600 lines) and asks them to:

1. **Understand it** (comprehension questions),
2. **Find bugs** (anchored to specific lines),
3. **Discuss design decisions** (trade-off prompts),
4. **Suggest improvements.**

Goals: many users, possibly a paid product later. Volume matters (practice needs many examples with small variations). Grading must be **automated** (method still open, see section 9).

Why it exists: the owner (John) is a systems/embedded C programmer. His own interview gap was not knowledge but *fluency reading unfamiliar code under time pressure* (triple pointers, confusing syntax, real OS/driver source). Systems programming (kernel, drivers, runtimes, concurrency) is the first target domain.

### How to work with John
- He asks direct questions and is not afraid to say "I'm confused." **Lead with the short answer; define jargon in one line** (he once didn't know what a "manifest schema" was). Use a concrete example before the abstraction.
- Propose, then ask before big irreversible choices (stack, licensing, DB). He decides the product direction.
- Don't pad. No lists of options when a recommendation exists; give your recommendation and why.

## 2. Decisions already made (do not relitigate without asking)

| Decision | Reasoning |
|---|---|
| Source examples from **real open-source code**, not LLM generation | Avoids having to trust/validate AI-invented code. |
| **We inject the bugs ourselves** (mutation). Do **not** use real historical bugs/fix commits | John's explicit choice. Real bugs may be added later as a separate source. |
| Bug truth comes from **execution**, not LLM opinion | A bug counts only if a test, ASan/UBSan/TSan, or similar actually catches it. Evidence is stored. |
| **Scripts are the backbone; LLMs only for judgment steps** | Gates must be code that can't be argued out of failing. |
| Build **2-3 more examples by hand** (with Claude's help) **before** automating | Learn which steps are stable vs. variable. Don't over-build a rigid pipeline first. |
| An example = a **folder** with `public.json`, `key.json`, `manifest.json`, `code/` | Folders now; a DB later (schemas should carry over). |
| Split **public / key / manifest** | The candidate's browser must never receive grading content. |
| Python for tooling, C for the exercises (first language) | Language-specific gates (ASan etc.) come per language; the manifest is language-agnostic. |
| Candidate UI = **hybrid**: text boxes for comprehension/design, **line-anchored comments** for bugs | See section 8. |
| Product name is **ReadCode** (the old "Literacy" name is gone) | John, 2026-10-13. |
| Stack: **React + TypeScript + Vite + Tailwind** frontend, **FastAPI** (Python) backend | John, 2026-10-13. Grader and tools are Python, so one backend language. |
| Pre-existing frontend/backend code yields to what was planned in the design sessions | John deleted the old backend; old Dashboard was replaced. |
| v1 exercise screen: **no hint button**, **soft countdown timer** (red when over, never auto-submits), **full file shown by default** (collapse is opt-in) | John, 2026-10-13. Hiding code could hide bugs. |
| LLM judge: use a **free** option if one is found; otherwise hold off (FakeJudge only) | John, 2026-10-13. None found yet (no Ollama etc. installed). |

## 3. What exists today (inventory)

Copy these into the repo (suggested layout, section 4). Paths below are where they were produced.

| Item | Source path | What it is |
|---|---|---|
| Example 001 (final layout) | `readcode-001.zip` -> `readcode-001/` | LRU cache in C, 502 lines, 10 seeded bugs. **Passes the validator.** The reference example. |
| Validator | `readcode-tools/validate_example.py` | Schema + consistency checks (section 6). |
| Schemas | `readcode-tools/schemas/{public,key,manifest}.schema.json` | JSON Schema draft 2020-12. Canonical copies. (`readcode-schemas/` is a duplicate; delete it.) |
| Original 001 files | `readcode-001-lru-cache/` | `lru_cache.c`, old combined `rubric.json` (**superseded** by `key.json`+`public.json`), `submissions/calibration-a.json` + `.expected.json`. |
| Kernel prototype | `readcode-002-kernel-sort-prototype/` | Real Linux `lib/sort.c` + shim + driver + 8 mutants. **Prototype only, GPL, not yet in the example layout.** |
| UI mockup | https://claude.ai/artifact/XwUTqGiPr5w3X5K3nhnj8i (source: `artifacts/<id>/project/Main.dc.html`) | Static desktop mockup of the exercise screen. |

## 4. Repo layout (as built)

```
CLAUDE.md  requirements.txt  pytest.ini     # pytest runs tests/ and backend/tests/
schemas/                 # public, key, manifest, submission, grading-report .schema.json
tools/
  validate_example.py    # section 6
  sync_public.py         # copies ONLY public.json + listed code/ files into frontend/public/exercises/ (temporary, until the API serves them)
  (future) run_gates.py, mutate.py, build_manifest.py
tests/                   # validator tamper tests, sync leak tests
examples/readcode-001/
backend/
  grader/                # section 9; plain Python, no web framework
  tests/                 # grader tests + fixtures (strong/weak sample submissions)
frontend/                # React/Vite/Tailwind; npm run dev (runs sync first), npm test (vitest), npm run build
docs/ui-mockup/          # exported mockup (Main.dc.html carries the exact design values)
(missing) prototypes/kernel-sort/, calibration/readcode-001/   # not in John's downloads yet
```

Python: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`. C tests need `gcc` with ASan/UBSan.
The manifest schema was updated to match the validator/example (`shipped[]` required, `baseline.path` optional): the downloaded copy predated them.

## 5. The example format (the central data structure)

```
readcode-NNN/
  public.json        # candidate-facing: id, version, title, language, difficulty, topics,
                     #   estimated_minutes, files[{path,line_count}], license{spdx,attribution},
                     #   questions[{id:C#,text}], design_prompts[{id:D#,text}]
  key.json           # grader-only: scoring{total:100,sections}, comprehension[{question_id,weight,key_points}],
                     #   bugs[{id:B#,title,severity,weight,category,locations[{file,function?,start_line,end_line}],
                     #         description,mechanism_anchors,fix}],
                     #   design[{prompt_id,topic,weight,anchors}], improvements{weight,expected_themes},
                     #   red_herrings[{description,locations?}], bonus?, grader_instructions
  manifest.json      # provenance + results of every check (internal)
  code/              # EXACTLY what the candidate sees
  internal/
    baseline/        # the clean reference version of the code
    verification/    # driver + gate script
    evidence/        # one file per gate result (B1.txt ... gate_a.txt)
```

**Conventions**
- IDs: example `readcode-NNN` (folder name must match), questions `C#`, design prompts `D#`, bugs `B#`.
- `public.files[].path`, `key.bugs[].locations[].file`, and `manifest.shipped[].path` are **relative to `code/`**. `manifest.baseline.path` and all `evidence_file` values are **relative to the example root**.
- `manifest.bugs[].change.old` = clean text (must occur in the baseline). `change.new` = bugged text (must occur in the shipped code starting exactly at `line`). `line` must fall inside one of the key's locations for that bug.
- `manifest.shipped[].sha256` / `baseline.sha256` pin the files. **Editing shipped code invalidates the gates; rerun them and rebuild the manifest.**
- `review.status`: `pending` -> `changes_requested` -> `approved`. Approval requires gate A passed, `rubric` and `pilot_solve` present (schema enforces), every bug detected (validator enforces), reviewer + timestamp. `publish` only when approved.
- Scoring: total 100 = comprehension 20 + bugs 40 + design 25 + improvements 15 (bonus up to +3 on top). Bug credit split 40% locate / 40% mechanism / 20% fix. A **confident** claim that a listed red herring is a bug costs 2 points.

**Backend rule (when built):** serve candidates only `public.json` + `code/`. Never serve `key.json`, `manifest.json`, or `internal/`. Validate `public.json` against its schema on the way in *and* out.

## 6. Validator (`tools/validate_example.py`)

```
python tools/validate_example.py examples/readcode-001
python tools/validate_example.py --all examples/
```
Exit 0 if no errors (warnings allowed). Layer 1 = JSON Schema. Layer 2 (runs only if layer 1 is clean) checks: ids/versions consistent across files and folder name; `line_count` correct; unique/matching question, prompt, and bug IDs; weights sum per section and to 100; key line ranges inside the files; manifest hashes match files; each bug's recorded change matches the shipped code and baseline and lies in the key's range; evidence files exist; approved => all bugs detected; license consistent; `public.json` has no grader-only fields and no verbatim key points; warns on hint words (BUG/FIXME/seeded...) in the code and on unlisted files in `code/`.

Tested by breaking a copy six ways (edited code, bad weights, unknown question ID, range outside file, premature approval, leaked key); all rejected. **Add a real test suite** (pytest) that encodes those cases.

## 7. The pipeline (target process)

```
request (topics, difficulty, bug count, line range)
 1 select + license/provenance        [script + index]
 2 make self-contained                [LLM/agent in sandbox, hand-assisted at first]
   gate A: baseline compiles and passes the sanitizer driver     [script]
 3 inject bugs (mutation)             [script; LLM may suggest mutants]
   gate B: every bug detected, evidence stored                   [script]
 4 rubric: facts from evidence (script) + soft parts (LLM)
   gate C: every cited line range exists/supports the claim      [script]
 5 pilot solve: a strong model attempts it, graded with the rubric [LLM]
 6 human review  -> 7 fixes (rerun all gates) -> 8 publish (+ dedupe/coverage check)
 9 telemetry: per-item difficulty/discrimination, flag button, retire/revise
```
Only steps 2, the soft part of 4, and 5 need an LLM. Everything else is deterministic code. **Rule: any claim about a bug must be backed by evidence a script produced.** Never mark `detected: true` by hand.

Status: gates A/B are implemented for example 001 (`internal/verification/run_gates.py`) and prototyped for `sort.c`. Steps 1, 4-gate-C, 5, 8, 9 do not exist yet.

## 8. Candidate experience and answer format

UI mockup (static): code pane with outline sidebar and collapsible hidden ranges; select lines to open an inline comment composer (type Bug/Question/Design/Improvement, severity, confidence, "what is wrong and why does it fail?", optional fix, "link another range"); right panel with tabs Understand / Bugs / Design / Improve, one text box per question card.

**Submission** format: `schemas/submission.schema.json` (built 2026-10-13). Bug comments carry `locations:[{file,start_line,end_line}]` instead of the older free-text `lines`; `calibration-a.json` (not yet in the repo) uses the older shape and will need converting. Composer types map as: Bug -> `bugs[]`, Improvement -> `improvements[]` (with locations), Question / Design concern -> `notes[]` (unscored; design notes are given to the judge as context for the design section). `confidence` is `guess | fairly_sure | certain`; the confident ones (`fairly_sure`, `certain`) are penalized on red herrings.

**Exercise screen** (`frontend/src/pages/ExercisePage.tsx`, built 2026-10-13 from the mockup): outline parsed from the C source (banner comments = sections), drag/shift-click line selection, composer with link-another-range, comment cards, four tabs, Ctrl+F search, opt-in collapse, autosave to localStorage, review dialog, and a submitted view that shows the submission JSON (grading not connected; there is no API yet). Single-file exercises only; multi-file needs a file switcher. `candidate_id` is `local` (no accounts).

## 9. Grading (scaffolded 2026-10-13: see `backend/README.md`)

Built: matcher (line +/-5 or function; function-only needs a mechanism score; best-explanation-first assignment; red-herring claims never earn locate credit), judge interface + response schema + prompt builder + `FakeJudge` (word overlap, not a real judge), scoring (weights, 40/40/20, -2 confident red herring, bonus 1/item capped, blank answers always 0, total floored at 0), report schema, CLI, 29 tests. Not built: a real LLM judge, the FastAPI endpoint, the calibration check (needs calibration-a).

Original plan: deterministic layer matches bug locations (line overlap/function) against `key.json`; an LLM judge scores explanations/fixes and design/comprehension answers against anchors and key points, returns per-section scores, found/missed bugs, false positives, and one coaching tip. Unlisted-but-plausible findings are **not** penalized (real code may contain latent bugs); queue them for human review. Calibration: `calibration-a` (mid-level candidate) should score about **63.8** (acceptable 58-70); found B1,B2,B4,B5,B6, partial B8; missed B3,B7,B9,B10; one confident false positive (bucket count = capacity). **Still needed:** a weak (~30) and strong (~90) calibration candidate with expected scores, to check the grader separates them.

## 10. Gate harness: how example 001's checks work (reuse the pattern)

- `internal/verification/driver.c` `#include`s the unit under test with `-DUNIT="path"` and renames its `main`. One named test per process (`t0`, `B1`..`B10`) so a crash/hang is attributable.
- Compile flags: `-std=gnu11 -O1 -g -fno-omit-frame-pointer -fsanitize=address,undefined -fno-sanitize-recover=all -pthread -w`; run with `ASAN_OPTIONS=detect_leaks=0`.
- Allocator hooks (macros for `malloc/calloc/free`) count live allocations (leak checks without relying on LeakSanitizer, which may not work in sandboxes), can fail the Nth `calloc`, and can make `malloc(0)` return NULL.
- A test is valid only if it **passes on the clean baseline** and **fails on the shipped code**. `t0` (ordinary behaviour) must pass on both, proving tests discriminate.
- `detected_by` is derived from output: `asan`, `ubsan`, or `test-driver` (assertion/signal/timeout).
- Evidence files must not contain machine-specific paths (scrubbed to `<example>`).

**Lessons learned**
- Allocate test buffers at **exact size**. A one-byte slack hid overruns from ASan in the first `sort.c` harness.
- Intra-object overreads (e.g. unterminated key inside a struct) are not caught by ASan; catch them by behaviour (round-trip test).
- B10 (zero-length values) is only detectable by simulating a conforming `malloc(0)==NULL`; glibc never fails. Don't present it as a natural crash.
- In 001 the **baseline was derived by reverting the seeded bugs** (hand-written exercise), not by mutating a clean original. For scraped examples the order is reversed: clean baseline first, then mutants.

## 11. Kernel prototype (`readcode-002-kernel-sort-prototype/`)

- Real `lib/sort.c` (357 lines, `torvalds/linux` master at the time, **GPL-2.0**). Needs only a tiny shim (`shim/linux/{types,export,sched,sort}.h`).
- `harness/driver.c`: 11 element sizes x 21 lengths x 5 patterns x 3 base alignments x 6 APIs = 20,790 sorts; checks sortedness and that the result is a permutation. Baseline passes under ASan+UBSan.
- `harness/mutate.py` applies 8 single-line mutants (exactly-once string replace); `harness/build_run.sh` builds and classifies each. **All 8 were detected**: M1,M2,M3,M4,M7,M8 by ASan/UBSan, M5,M6 only by the driver's checks. See `RESULTS.md`.
- **Caveats:** scripts hardcode `/tmp/rc` paths (fix); no equivalent-mutant discard has been exercised (none survived); detection != good exercise (M7 crashes dramatically but may be hard to spot by reading); not yet converted to the example layout (needs `public.json`, `key.json`, questions, manifest, comment-stripping decision).

## 12. Licensing and sourcing

- Linux files are all GPL (2.0-only / 2.0-or-later). Fine for prototyping the pipeline; **do not ship to paying users until John gets a real legal opinion**. Claude is not a lawyer.
- Prefer permissive sources for public examples: MIT/BSD/Apache-2.0/public domain. Candidates (verify each header before use): xv6, Zephyr (`lib/os`, `lib/heap`), FreeBSD, musl, Lua, SQLite, lwIP, FreeRTOS. Record SPDX + provenance in the manifest; keep attribution in `public.json`.
- Example 001's license is a placeholder (`LicenseRef-ReadCode-Original`); John must choose.
- GitHub's unauthenticated API rate-limits fast. To mine/clone, use `git clone --filter=blob:none` or an authenticated token, not the REST API.

## 13. Ground rules for code changes

1. **Never hand-edit `code/` of an existing example** without rerunning gates and regenerating `manifest.json` hashes; the validator will fail otherwise.
2. **Never put key content in `public.json`** or anything under `code/`. Strip comments that give bugs/fixes away (or decide deliberately to keep explanatory comments; it changes difficulty).
3. Every new check must write an **evidence file** and a manifest field, and have a **test that it fails when it should**.
4. Keep schemas the source of truth; update schemas, validator, and example together; run `--all` before finishing.
5. Prefer small, runnable steps. Show John the result of a run, not just the code.
6. Don't invent facts about licenses, datasets, or tools. Say what is unverified. (Unverified in this project so far: exact license headers of the permissive projects listed above; the contents/quality of CVEfixes/Big-Vul/DiverseVul; whether LeakSanitizer works in the target CI.)

## 14. Next steps (suggested order)

1. Create the repo from section 4; run the validator on example 001 and confirm it passes; add pytest tests for the six tamper cases.
2. Remove hardcoded `/tmp` paths from `run_gates.py` and the `sort.c` harness scripts; make them take an example directory.
3. Convert the `sort.c` prototype into `readcode-002` in the real layout (choose a subset of 3-5 mutants, decide about comments, write questions, `key.json` from mutation records and sanitizer evidence, manifest). This is the first test of the **mutation-based** flow and will show what the layout is missing.
4. Write `submission.schema.json` and a grader skeleton (deterministic matching first, LLM judge second); build weak/strong calibration candidates.
5. Generalize: a `build_manifest.py` that assembles `manifest.json` from mutation records and gate results; a generic mutation runner (operators + kill check + equivalent-mutant discard).
6. Add a citation check (gate C) and the pilot-solve step; then the review step and publish flow.
7. Only then: DB design, backend API (serve public part only), UI implementation from the mockup. **Ask John before choosing a web stack** (undecided).

**Progress (2026-10-13):** step 1 done (validator passes, tamper tests). Step 4 partly done (submission schema, grader scaffold, strong/weak fixtures but no expected scores). Step 7 partly done (stack chosen, exercise screen built against static files). Steps 2, 3, 5, 6 not started. Steps 3 and calibration are blocked on files missing from John's downloads (kernel prototype, calibration-a).

## 15. Open questions for John

- Hosting? Auth/payments scope for v1?
- Which LLM for the judge, given no free option was found? (Paid Claude API, or a local model like Ollama if he installs one.)
- Which license for original exercises; whether to seek legal advice on GPL code.
- Keep or strip explanatory comments in scraped code (difficulty vs. hint)?
- How many seeded bugs per exercise by difficulty tier? Are hints (e.g. showing demo output for -5 points) wanted?
- Additional languages after C (each needs its own gate harness)?
