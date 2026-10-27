# Pipeline design

## v1 (build this)
- Taxonomy: 71 backend concepts.
- Sources: pool of ~5 TypeScript repos.
- Classifier: posting -> concept weights.
- Example bank: storage only (folders with manifests).

Steps:
1. Take job posting as input (pasted text)
2. Classify weights
3. Pick concept(s) manually from the highest weights
4. LLM proposes anchor file + supporting files + bug pattern + injection site,
   from the pool; human accepts or requests another file/repo
5. Self-contain (preserve the injection site)
6. Compile check (tsc --noEmit)
7. Inject the chosen bug
8. Questions + rubric
9. Human review
10. Save to bank

Manifest must record at least: sources (repo@sha:path), tests (concept IDs),
present (concept IDs), language, level, origin, bug_pattern, license.
With these, everything below can be computed later without redoing examples.

## Deferred (target design)

### Coverage of a posting
For each of the posting's top N topics (N=10, optionally weight >= 0.3):
  required = max(1, ceil(weight * K))        # K = 5
  credit   = min(count / required, 1)        # count = bank examples TESTING it
coverage score = sum(weight * credit) / sum(weight)
Covered if coverage score >= 0.8 AND the top topic has credit = 1.

### Choosing the concept
shortfall = weight * (1 - credit). Highest first; top topic first if unserved.
Across many postings, sum shortfall per concept -> generation queue.
Recompute after each example is added.

### Choosing the file
effective score = file weight for concept * 0.5^(times file used for that concept)
Reuse count is derived from manifests (accepted examples only), not stored.
Could apply per (file, bug pattern) instead of per file.

### Pairing (postponed)
Anchor on top shortfall concept A. For files strong on A, score partner X:
pair score = shortfall(X) * file weight for X; require file weight for X >= 0.5.
Otherwise single-concept example.

### Bank distribution vs demand
Demand = normalized average of posting weights (normalize each posting first).
Gap = demand - coverage share. Floor (e.g. 3 per active concept) and cap.
