# CLAUDE.md: ReadCode

Read this whole file before writing code.

## 1. What this project is

**ReadCode** is an interview-prep / study tool, a "LeetCode in reverse" focused on **reading** code. A user gets a
decent-sized piece of real code and is asked to show understanding, find bugs, discuss design decisions, and
suggest improvements.

History: the repo started with a C/systems design (example 001, an LRU cache with 10 bugs proven by ASan/UBSan
gates, and a grader scaffold). On 2026-10-26 John replaced that with a **new pipeline**, designed in a claude.ai
conversation (`docs/conversation-record.md`, `docs/pipeline-design.md`). **The new pipeline trumps everything from
the old design.** What survives from the old repo: the frontend, and the example folder structure/schemas (now v2).
The old material is in `archive/` (see `archive/README.md`), not maintained.

### How to work with John
- He asks direct questions and is not afraid to say "I'm confused." **Lead with the short answer; define jargon in one line.** Use a concrete example before the abstraction.
- Propose, then ask before big irreversible choices (stack, licensing, DB). He decides the product direction.
- Don't pad. No lists of options when a recommendation exists; give your recommendation and why.

## 2. Decisions (do not relitigate without asking)

| Decision | Source |
|---|---|
| v1 language **TypeScript/JavaScript**; v1 field **backend** | new pipeline |
| Real open-source code as the base; LLM only to adapt/scaffold. Tag `origin` (real / adapted / generated) | new pipeline |
| Curated pool of trusted repos (`pool/sources.yaml`), permissive licence, **pinned commits**, every licence checked by hand at the commit | new pipeline |
| We inject the bugs ourselves | both |
| **Runnable checks are not part of v1.** The gate is a compile check (`tsc --noEmit`) on the clean version and again after injecting | John, 2026-10-26 |
| Generate offline + human review into a bank; postings select from the bank later | new pipeline |
| Plain Python stages that read/write files; no graph framework unless branching/retry gets painful | new pipeline |
| Taxonomy ids `field.area.concept` (exactly 3 levels), stable, never reused. **Don't build the taxonomy/classifier now**; record concept ids as strings | John, 2026-10-26 |
| v1: no coverage math / reuse tracking; pick concepts manually | new pipeline |
| Questions: 2-3 per dimension (understanding, bugs, design, improvements); bug question is open-ended. Rubric = small checkable points, `required` or `bonus` | new pipeline |
| An example = a folder `readcode-NNN/` with `public.json`, `key.json`, `manifest.json`, `code/`, `internal/` | old design, kept |
| Split public / key / manifest: the candidate's browser never receives grading content | old design, kept |
| Frontend: React + TypeScript + Vite + Tailwind. Hybrid UI: text answers per question + line-anchored comments. No hint button, soft countdown timer, full file shown | old design, kept |
| Stack for a backend when built: FastAPI (Python) | John, 2026-10-13 |
| LLM judge: free option if found, otherwise hold off | John, 2026-10-13 |

## 3. Pipeline (v1, `docs/pipeline-design.md`)

```
1 paste a job posting            2 classify concept weights        3 pick concept(s) manually
4 LLM proposes anchor file + supporting files + bug pattern + injection site; human accepts or asks for another
5 self-contain (preserve the injection site)   -> internal/baseline/
6 compile check                                -> tools/compile_check.py
7 inject the bug                               -> tools/inject_bugs.py, then compile check again
8 questions + rubric                           -> public.json, key.json
9 human review                                 -> manifest.review
10 save to bank
```
Steps 1-3 are done by hand for now (`postings/`, `classifications/`, `taxonomy/` hold the planning examples).
Coverage, concept choice, file reuse and pairing are designed but deferred (`docs/pipeline-design.md`).

## 4. Repo layout

```
CLAUDE.md  requirements.txt  pytest.ini          # pytest runs tests/
docs/        pipeline-design.md, conversation-record.md, ui-mockup/
pool/        sources.yaml (trusted repos)          taxonomy/  postings/  classifications/   (planning inputs)
schemas/     public, key, manifest, submission .schema.json   (schema_version 2)
tools/
  validate_example.py   # schema + consistency checks (section 6)
  inject_bugs.py        # baseline + manifest.bugs -> code/, records bug lines and line counts
  compile_check.py      # tsc on baseline and code/, writes evidence + hashes into the manifest
  sync_public.py        # copies ONLY public.json + listed code/ files to frontend/public/exercises/
  ts/                   # pinned toolchain: typescript 5.9.3, @types/node 24.19.2 (`npm install` once)
tests/       validator tamper tests, pipeline tool tests, sync leak tests
examples/readcode-002/  # BullMQ worker, the first v2 example
frontend/    npm run dev (syncs first), npm test (vitest), npm run build
archive/     v1 example 001, v1 grader, v1 schemas
```
Setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`, `(cd tools/ts && npm install)`, `(cd frontend && npm install)`.

## 5. The example format (schema_version 2)

```
readcode-NNN/
  public.json    # candidate-facing: id, version, title, intro?, language, level, estimated_minutes,
                 #   concepts[{id,name}] (= manifest tests + present, unmarked), files[{path,line_count}],
                 #   license{spdx,attribution,source_url?},
                 #   questions[{id:Q#, dimension: understanding|bugs|design|improvements, text}]
  key.json       # grader-only: bugs[{id:B#, title, pattern, locations[{file,function?,start_line,end_line}],
                 #   description, runtime_failure, conditions, fix}],
                 #   rubric[{id:R#, question_id, kind: required|bonus, point, bug_id?}], grader_notes?
  manifest.json  # internal: sources[{repo,commit,path,sha256,license_spdx,license_evidence,code_path}],
                 #   tests[], present[] (concept ids), language, level, origin, bug_pattern, license,
                 #   taxonomy_version, baseline{files,changes_summary,compile_check},
                 #   shipped{files,compile_check}, bugs[{id,file,line,change{old,new}}], review
  code/          # EXACTLY what the candidate sees; generated by tools/inject_bugs.py, never hand-edited
  internal/
    baseline/      # clean self-contained code, same paths as code/
    verification/  # tsconfig.json for the compile check
    evidence/      # compile_baseline.txt, compile_shipped.txt
    build-instructions.md (optional)
```
**Conventions**
- `tests` = concepts the example tests (has an injected bug + rubric points). `present` = tags only.
- Paths in `public.files`, `key...locations.file`, `manifest.bugs.file`, `*.files.path` are relative to `code/` (and to `internal/baseline/`). `evidence_file` is relative to the example root.
- `change.old` occurs exactly once in the baseline file; `change.new` replaces it; `line` is where `new` starts in `code/`.
- Undoing every recorded change on `code/` must give back the baseline exactly (validator enforces): no unrecorded edits.
- `review.status`: pending -> changes_requested -> approved. Approval requires both compile checks passed (schema).

**Workflow to change an example:** edit `internal/baseline/` or `manifest.bugs`, then
```
.venv/bin/python tools/inject_bugs.py examples/readcode-002
.venv/bin/python tools/compile_check.py examples/readcode-002
.venv/bin/python tools/validate_example.py --all examples/
```

## 6. Validator

Layer 1 JSON Schema; layer 2 (only if layer 1 is clean): ids/versions/folder name, language/level match; line counts;
unique ids; every question has a required rubric point, every bug has a required point with its `bug_id`; rubric
refers to real questions/bugs; key ranges inside the files; baseline and shipped hashes; compile evidence exists;
each bug's change is at its line and inside the key's location; code/ minus the bugs == baseline; licence
consistency; `public.concepts` == manifest tests + present; `public.json` contains no grader-only fields, rubric points, or bug descriptions/fixes; warnings for
hint words in the code, unlisted files in `code/`, a dimension with no question, a failed compile check.

## 7. Frontend

`frontend/src/pages/ExercisePage.tsx`: the code pane is **Monaco** (VS Code's editor; `exercise/CodeEditor.tsx`,
setup in `lib/monaco.ts`), one model per file: candidates can **edit** (ungraded scratch space), use find, folding, and
⌘/Ctrl-click go-to-definition across the exercise's files. Comments are stored with ORIGINAL line numbers and mapped to
the edited text by a line diff (`lib/linediff.ts`, tested); comment boxes are view zones (reserved space) with the content
in overlay widgets (view-zone content can't be clicked). Edited files get a dot, "Show my changes" (inline diff) and
"Reset file". Dark VS Code-style Explorer (FILES tree + OUTLINE), TypeScript/C outline, side-panel tabs per dimension,
line comments (Bug / Question / Design / Improvement), autosave to localStorage (answers and edits), submit shows the
submission JSON (`schemas/submission.schema.json`, v2: `answers` keyed by question id, `edits` as unified diffs). No grading is connected.
The exercise page is lazy-loaded (Monaco is ~3.4 MB plus a 6 MB TypeScript worker); trimming Monaco's unused languages is a TODO.
Visual language (John, 2026-10-26): dark with **near-black neutrals** (page `#0A0A0A`, code `#111111`, no blue tint),
**typographic** (no hairline borders or outlined boxes; structure comes from
whitespace, type size/weight and filled fields), slate-blue accent `#4A6FA5` for actions only, Source Sans 3 + Source Code Pro,
and one quiet hue per tab (Understand/Bugs/Design/Improve, `sec.*` tokens, `src/lib/hues.ts`) on the tab, question numbers,
section labels and comment stripes. Theme tokens live in `tailwind.config.js`. Concepts show as outlined tags
(`components/ConceptTags.tsx`) in the exercise header (one row, overflow collapses to "+N") and on the exercise list
(with area labels). They don't mark which concept the bug tests (that would hint). Not clickable yet; meant to lead to a
per-concept page of examples later.

## 8. Ground rules

1. Never hand-edit `code/`. Change the baseline or the manifest, then run inject, compile check, validate.
2. Never put key content in `public.json` or `code/`. Keep original names, comments and style when self-containing; don't clean up.
3. Every new check writes an evidence file and a manifest field, and has a test that it fails when it should.
4. Schemas are the source of truth; update schemas, validator, tools and examples together; run pytest and `--all`.
5. Don't invent facts about licences, repos or tools. Say what is unverified.
6. Licences: prefer MIT/BSD/Apache-2.0. Record SPDX + what was checked in `sources[].license_evidence`.

## 9. Status (2026-10-26)

- **readcode-002** (BullMQ worker, bug = `untrackJob` before `callProcessJob`) built through step 8: validator clean,
  both compile checks pass, 22 pytest + 12 vitest tests pass. **Waiting for John's review (step 9).** Open points for
  that review are in `manifest.review.notes`.
- Pool: bullmq pinned; cockatiel and powertools-lambda-typescript need pinned commits and licence checks.
- Not built: posting classifier, taxonomy file, bank/selection logic, grader for v2 keys, backend API.
