# Conversation record (reconstructed)

Chronological summary of the planning conversation. Decisions are marked **Decided**.

## 1. Job posting as input
- Idea: a job posting becomes an input to example generation.
- Concern raised: job sites often render with JavaScript (Apple and Amazon pages
  returned only page shells when fetched). Plan to accept pasted posting text.
- Split generation from serving: problems are generated offline and human-reviewed
  into a bank; postings select from the bank online.

## 2. Harness engineering / graph engineering
- "Harness engineering" (2026 term) = everything around a model in an agent:
  guardrails, verification, feedback loops. Mostly about autonomous agents.
- ReadCode's pipeline is mostly a fixed workflow with bounded LLM judgment calls,
  so harness engineering is slightly off as the main frame. Useful principles:
  cheap code checks before LLM checks; treat failures as signals.
- "Graph engineering" isn't an established term; likely means graph orchestration
  (e.g. LangGraph). **Decided**: plain Python stages that read/write files; add a
  graph framework only if branching/retry gets painful.

## 3. Taxonomy
- Hybrid approach: hand-built taxonomy, clustering of postings only to check gaps.
- Overweighting one field is fine. **Decided**: backend first.
- Structure: facets (concept / language / level), concept is a shallow tree.
  IDs like backend.resilience.retry-backoff. **Decided**: exactly 3 levels for now;
  structure defined by `parent`, never by counting dots.
- Draft has 13 areas, 71 concepts (see taxonomy/).
- Bug patterns per concept: not written yet; write only for chosen concepts.
- A `demand_prior` (prevalence) field was added then **removed**: aggregate posting
  demand already measures prevalence.
- Teaching value is a separate idea from prevalence (not stored for now).

## 4. Classifier
- Posting -> weights per concept (0–1), each with `basis` (explicit|implied)
  and `evidence` (quoted line). No quote, no explicit tag.
- Recommended mechanism: embeddings shortlist (~15), LLM weights the shortlist.
  No fine-tuning. Build a hand-labeled eval set (50–100 postings) eventually.
- Keep every concept >= ~0.3; use top ~5–10 for problem selection.
- Postings reviewed: Ring mobile role (not backend — good negative test case),
  Device Privacy SDE (vague backend), Amazon Pricing Shared Platform SDE
  (**chosen**; trimmed to first two paragraphs + qualifications because the
  posting is stitched from three teams).

## 5. Sources
- **Decided**: real open-source code as the base, LLM only to adapt/scaffold.
  Tag origin (real|adapted|generated) in manifest.
- Curated pool of trusted repos: permissive license, real use, builds + tests,
  readable modules (200–600 lines), covers several concepts. Pin commits.
- Classify repos at the FILE level (cheap import/call signals first, LLM second),
  weighting for teachability, not mere presence.
- **Decided**: switch v1 language from Go to TypeScript/JavaScript.
  Pool candidates: bullmq (queues), cockatiel (retries/resilience),
  aws-powertools/powertools-lambda-typescript (idempotency). pgx (Go) dropped.

## 6. Example bank, coverage, selection (designed, mostly deferred)
- Bank counts are discrete: each concept an example TESTS counts +1
  (tested = has an injected bug and rubric items). Present-only concepts are tags.
- Coverage, shortfall, file-reuse penalty, pairing — see docs/pipeline-design.md.
- Generation targets concepts (not postings); postings drive priority/selection.
- **Decided for v1**: skip coverage math and reuse tracking; pick concepts
  manually from top weights; request other files/repos manually when needed.

## 7. Choosing file and bug together
- Bug pattern affects which file is best, so step 4 picks file + bug pattern +
  injection site together. Self-containment must preserve the injection site.
- Keep a compile check (not runnable tests) after self-containing.

## 8. Rubric/questions
- Order: bug -> questions -> rubric.
- Good bug: local, plausible, detectable by reading, described (lines, runtime
  failure, conditions).
- Questions across 4 dimensions: understanding, bugs (open-ended), design,
  improvements. 2–3 each to start.
- Rubric: small checkable points, required vs bonus, so LLM grading is possible later.

## 9. First example
- Concept: backend.messaging.queues-consumers (+ at-least-once-delivery).
- BullMQ worker excerpts; bug = lock untracked before processing.
  See examples/bullmq-worker-lock-early-release/INSTRUCTIONS.md.
