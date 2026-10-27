// Minimal types and stand-ins for the parts of BullMQ these files depend on.

export type JobProgress = string | boolean | number | object;

export interface Job<
  DataType = any,
  ResultType = any,
  NameType extends string = string,
  ProgressType extends JobProgress = JobProgress,
> {
  id: string;
  name: NameType;
  data: DataType;
  progress: ProgressType;
  token: string;
  attemptsStarted: number;
  processedOn: number;
  deferredFailure?: string;
  moveToCompleted(
    returnValue: ResultType,
    token: string,
    fetchNext?: boolean,
  ): Promise<Job<DataType, ResultType, NameType, ProgressType> | undefined>;
  moveToFailed(
    err: Error,
    token: string,
    fetchNext?: boolean,
  ): Promise<Job<DataType, ResultType, NameType, ProgressType> | undefined>;
}

export type Processor<
  DataType = any,
  ResultType = any,
  NameType extends string = string,
  ProgressType extends JobProgress = JobProgress,
> = (
  job: Job<DataType, ResultType, NameType, ProgressType>,
  token?: string,
  signal?: AbortSignal,
) => Promise<ResultType>;

export interface WorkerOptions {
  name?: string;
  concurrency?: number;

  maximumRateLimitDelay?: number;

  maxStartedAttempts?: number;

  /**
   *  Skip lock renewal for this worker. If set to true, the lock will expire
   *  after lockDuration and moved back to the wait queue (if the stalled check is
   *  not disabled)
   *
   *  @defaultValue false
   */
  skipLockRenewal?: boolean;

  /**
   * Duration of the lock for the job in milliseconds. The lock represents that
   * a worker is processing the job. If the lock is lost, the job will be eventually
   * be picked up by the stalled checker and move back to wait so that another worker
   * can process it again.
   *
   * @defaultValue 30000
   */
  lockDuration?: number;

  /**
   * The time in milliseconds before the lock is automatically renewed.
   *
   * It is not recommended to modify this value, which is by default set to
   * half the lockDuration value, which is optimal for most use cases.
   */
  lockRenewTime?: number;

  runRetryDelay?: number;
}

export interface GetNextJobOptions {
  block?: boolean;
}

/**
 * Stand-in for the Redis-backed queue backend. In BullMQ each of these
 * operations is a Lua script that runs atomically on the server.
 *
 * Separately from the worker's main loop, a stalled-job checker runs every
 * `stalledInterval` milliseconds. It moves active jobs whose lock has expired
 * back to the wait list, so that a worker can pick them up again.
 */
export interface QueueBackend<
  DataType = any,
  ResultType = any,
  NameType extends string = string,
  ProgressType extends JobProgress = JobProgress,
> {
  closing: Promise<void> | undefined;
  /** Moves the next waiting job to active and locks it with `token` for `lockDuration` ms. */
  getNextJob(
    token: string,
    name?: string,
  ): Promise<Job<DataType, ResultType, NameType, ProgressType> | undefined>;
  /** Blocks until a job may be available. Resolves with the time the next delayed job is due, or 0. */
  waitForJob(blockUntil: number): Promise<number>;
  /** Returns the ids of the jobs whose lock could not be extended. */
  extendLocks(
    jobIds: string[],
    tokens: string[],
    duration: number,
  ): Promise<string[]>;
  /** Moves a rate-limited job back to wait. Returns the remaining rate-limit TTL in ms. */
  moveJobFromActiveToWait(jobId: string, token: string): Promise<number>;
  close(force?: boolean): Promise<void>;
}

/**
 * Minimal interface that LockManager needs from Worker.
 * This allows LockManager to access worker methods without inheriting from QueueBase.
 */
export interface LockManagerWorkerContext {
  /**
   * Extends locks for multiple jobs.
   */
  extendJobLocks(
    jobIds: string[],
    tokens: string[],
    duration: number,
  ): Promise<string[]>;

  /**
   * Emits events to worker listeners.
   */
  emit(event: string | symbol, ...args: any[]): boolean;

  /**
   * Queue name.
   */
  name: string;
}

export const RATE_LIMIT_ERROR = 'bullmq:rateLimitExceeded';

export class UnrecoverableError extends Error { name = 'UnrecoverableError'; }
export class DelayedError extends Error { name = 'DelayedError'; }
export class WaitingError extends Error { name = 'WaitingError'; }
export class WaitingChildrenError extends Error { name = 'WaitingChildrenError'; }

export function isNotConnectionError(error: Error): boolean {
  return !/ECONNREFUSED|ECONNRESET|Connection is closed/.test(error.message);
}

export function delay(ms: number, abortController?: AbortController) {
  return new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    abortController?.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
