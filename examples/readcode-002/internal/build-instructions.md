# Example build instructions: bullmq-worker-lock-early-release

## Target
- Tests (primary): backend.messaging.queues-consumers
- Tests (secondary, same bug): backend.messaging.at-least-once-delivery
- Present only (tags): backend.concurrency.thread-worker-pools,
  backend.resilience.graceful-shutdown, backend.resilience.rate-limiting
- Language: typescript. Level: mid (adjust after review).
- Origin: adapted (real code, trimmed + stubbed).

## Source
Repo: https://github.com/taskforcesh/bullmq (MIT)
Commit: 6dc4745f1121e68dcbc77d5e59fb88d1b17cb5af
Line numbers below are at this commit.

## Files to excerpt (target total 500–650 lines)

1. src/classes/worker.ts (anchor, ~300 lines after trimming)
   - mainLoop()                         lines 672–753
   - processJob()                       lines 1045–~1152
   - getUnrecoverableErrorMessage()     follows processJob
   - handleCompleted(), handleFailed()  through ~line 1252
   - close()                            lines 1380–1428 (drop first if over budget)
   - Keep only the class fields these methods use (closing, paused, waiting,
     _concurrency, limitUntil, blockUntil, lockManager, opts, id, name).

2. src/classes/async-fifo-queue.ts (196 lines, keep whole)

3. src/classes/lock-manager.ts (~150 of 221 lines)
   - Keep: class doc comment ("prevent them from being considered stalled by
     other workers" — this is the reader's main clue), trackedJobs, start(),
     startLockExtenderTimer(), extendLocks() (simplified), close(),
     trackJob(), untrackJob().

## Self-containment (step 5)
- Remove all telemetry: trace(), span, SpanKind, TelemetryAttributes.
- Replace with small stubs in a single `types.ts` (or top of file):
  - interface Job { id: string; token: string; attemptsStarted: number;
    processedOn: number; deferredFailure?: string;
    moveToCompleted(result, token, fetchNext): Promise<unknown>;
    moveToFailed(err, token, fetchNext): Promise<unknown>; }
  - class DelayedError, WaitingError, WaitingChildrenError, UnrecoverableError
    (one-liners); const RATE_LIMIT_ERROR = 'bullmq:rateLimitExceeded'.
  - retryIfFailed(fn, opts): simplified to try once, retry after delayInMs on
    error, emit 'error' if onlyEmitError.
  - Backend: { closing: boolean; close(force): Promise<void> } and a
    getNextJob stub standing in for Redis.
  - Worker extends Node's EventEmitter for emit().
- Redis/Lua (stalled checker, moveToActive scripts) is out of scope: represent it
  only through the stubs. Add ONE neutral comment near the backend stub stating
  that a separate stalled-job checker re-queues active jobs whose lock has
  expired. Do not hint at the bug.
- PRESERVE processJob's structure around trackJob(...) and callProcessJob(...):
  that is the injection site.
- Keep original names, comments, and code style. Do not clean up.

## Compile check (step 6)
`tsc --noEmit --strict` on the clean version (before injecting). Must pass.

## Bug to inject (step 7)
Pattern: lock released before processing finishes.
Change: in processJob(), immediately before
  `const result = await this.callProcessJob(`
insert
  `this.lockManager.untrackJob(job.id);`
Make it look natural (e.g. no comment, matching style of nearby untrack calls).

Effect: the job is no longer tracked, so its lock is never renewed while the
processor runs. Any job running longer than lockDuration has its lock expire;
the stalled checker treats it as stalled and re-queues it; another worker (or this
one) processes it again -> duplicate processing. Short jobs hide the bug.
Conditions: processor duration > lockDuration (default 30s in BullMQ).

Re-run the compile check after injection.

## Questions (step 8) — 2–3 per dimension, open-ended for the bug
Understanding
- Walk through what happens from mainLoop fetching a job to the job completing.
- How does mainLoop limit how many jobs run at once?
- What is the LockManager for, and when does it renew locks?
Bugs
- Is there anything in how this worker processes jobs that could cause a job
  to run more than once? Under what conditions? (Do not point at the line.)
Design
- Why does processJob call untrackJob in several places, including `finally`?
- Why are DelayedError/WaitingError handled differently from other errors?
Improvements
- How would you make duplicate processing visible in production?
- What would you change so a long-running processor is safe?

## Rubric (step 8) — small checkable points
Bug
- [required] Identifies that untrackJob is called before callProcessJob,
  so the job's lock is not renewed while it runs.
- [required] Explains the consequence: lock expires, job considered stalled,
  re-queued and processed again (duplicate processing / at-least-once).
- [required] States the condition: only jobs longer than the lock duration.
- [bonus] Fix: remove the early untrack (untrack only after completion/failure,
  as the existing paths and `finally` already do).
- [bonus] Notes that processors should be idempotent anyway under at-least-once.
Understanding
- [required] Describes fetch -> process -> moveToCompleted/moveToFailed flow.
- [required] Explains concurrency is capped via AsyncFifoQueue.numTotal() vs
  _concurrency.
Design
- [bonus] Explains why untrack is repeated (each exit path, plus finally as a
  safety net; untrack is idempotent).

## Output (step 10)
Folder with: code files, public.json (code + questions), key.json (bug location,
explanation, rubric), manifest.json, e.g.:
{
  "sources": ["bullmq@6dc4745f:src/classes/worker.ts",
              "bullmq@6dc4745f:src/classes/async-fifo-queue.ts",
              "bullmq@6dc4745f:src/classes/lock-manager.ts"],
  "tests": ["backend.messaging.queues-consumers",
            "backend.messaging.at-least-once-delivery"],
  "present": ["backend.concurrency.thread-worker-pools",
              "backend.resilience.graceful-shutdown",
              "backend.resilience.rate-limiting"],
  "language": "typescript", "level": "mid", "origin": "adapted",
  "bug_pattern": "lock-released-before-processing",
  "license": "MIT", "taxonomy_version": "backend-v0"
}
Stop after step 8 for human review (step 9).
