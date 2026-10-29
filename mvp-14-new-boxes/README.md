# The new boxes

## The ticket

> **From:** Platform on-call. **Priority:** P1
>
> We moved ingest to the new 32-core machines last week. Since then the worker pool falls behind at peak and p99 latency is in seconds. The migration set `workers` to 32 in `config.json`, one per core. On the old 8-core boxes (8 workers) it was fine at last year's traffic.
>
> Find settings that keep up with today's peak (12,000 events/s) **and** next quarter's (13,000 events/s), with p99 under 250 ms at both.

The pool is `ingest/pool.py`, and its settings are in `config.json` (`workers`, `batch`, `prefetch`). The decode, enrich and commit work happens in a compiled extension owned by another team; there's no source. `python bench.py [--load N]` runs the pool on the staging cluster (same hardware as production) under replayed production traffic, using whatever is in `config.json`. **Staging is shared: you get 12 benchmark runs in total**, and like any real benchmark the numbers are noisy.

Change `config.json` only. Say "resolved" when the settings are in.

