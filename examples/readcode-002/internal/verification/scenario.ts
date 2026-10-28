// Bug-report scenario: one worker (concurrency 2), one job that takes 600 ms, a 200 ms lock.
// An in-memory backend stands in for Redis, with BullMQ's stalled-job rule: a job whose lock has
// expired is moved back to wait once; if it stalls again it is failed (maxStalledCount = 1).
import type { Job, QueueBackend } from './types';
import { Worker } from './worker';

const LOCK_MS = 200;
const JOB_MS = 600;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class MemoryBackend implements QueueBackend {
  closing: Promise<void> | undefined;
  waiting = ['job-1'];
  locks = new Map<string, { token: string; expiresAt: number }>();
  stalls = new Map<string, number>();
  state = new Map<string, string>([['job-1', 'waiting']]);
  #checker = setInterval(() => this.#checkStalled(), 50);

  #checkStalled() {
    for (const [id, lock] of this.locks) {
      if (lock.expiresAt > Date.now()) continue;
      this.locks.delete(id);
      const stalls = (this.stalls.get(id) ?? 0) + 1;
      this.stalls.set(id, stalls);
      if (stalls > 1) {
        this.state.set(id, 'failed (job stalled more than allowable limit)');
      } else {
        this.state.set(id, 'waiting');
        this.waiting.push(id);
      }
    }
  }

  #finish(id: string, token: string, state: string): undefined {
    const lock = this.locks.get(id);
    if (!lock || lock.token !== token) throw new Error(`Missing lock for job ${id}. moveToFinished`);
    this.locks.delete(id);
    this.state.set(id, state);
    return undefined;
  }

  async getNextJob(token: string): Promise<Job | undefined> {
    const id = this.waiting.shift();
    if (!id) return undefined;
    this.locks.set(id, { token, expiresAt: Date.now() + LOCK_MS });
    this.state.set(id, 'active');
    return {
      id, name: 'charge', data: {}, progress: 0, token, attemptsStarted: 1, processedOn: Date.now(),
      moveToCompleted: async (_result, t) => this.#finish(id, t, 'completed'),
      moveToFailed: async (_err, t) => this.#finish(id, t, 'failed'),
    };
  }
  async waitForJob(): Promise<number> {
    await sleep(20);
    return 0;
  }
  async extendLocks(ids: string[], tokens: string[], duration: number): Promise<string[]> {
    const errored: string[] = [];
    ids.forEach((id, i) => {
      const lock = this.locks.get(id);
      if (lock && lock.token === tokens[i]) lock.expiresAt = Date.now() + duration;
      else errored.push(id);
    });
    return errored;
  }
  async moveJobFromActiveToWait(): Promise<number> {
    return 0;
  }
  async close(): Promise<void> {
    clearInterval(this.#checker);
  }
}

async function main() {
  const backend = new MemoryBackend();
  let runs = 0;
  const worker = new Worker('payments', async () => {
    runs++;
    await sleep(JOB_MS);
    return 'ok';
  }, backend, { concurrency: 2, lockDuration: LOCK_MS });
  const errors = new Set<string>();
  worker.on('error', (err: Error) => errors.add(err.message));

  void worker.run();
  await sleep(1500);
  worker.closing = Promise.resolve(); // stop fetching; let running jobs finish
  await sleep(700);

  console.log(`processor runs started for job-1: ${runs}`);
  console.log(`times job-1 was found stalled: ${backend.stalls.get('job-1') ?? 0}`);
  console.log(`final state of job-1: ${backend.state.get('job-1')}`);
  console.log(`errors reported by the worker: ${errors.size ? [...errors].sort().join('; ') : 'none'}`);
  process.exit(0);
}

main();
