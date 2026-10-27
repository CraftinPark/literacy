import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { AsyncFifoQueue } from './async-fifo-queue';
import { LockManager } from './lock-manager';
import {
  DelayedError,
  GetNextJobOptions,
  Job,
  JobProgress,
  LockManagerWorkerContext,
  Processor,
  QueueBackend,
  RATE_LIMIT_ERROR,
  UnrecoverableError,
  WaitingChildrenError,
  WaitingError,
  WorkerOptions,
  delay,
  isNotConnectionError,
} from './types';

/**
 *
 * This class represents a worker that is able to process jobs from the queue.
 * As soon as the class is instantiated and a connection to Redis is established
 * it will start processing jobs.
 *
 */
export class Worker<
  DataType = any,
  ResultType = any,
  NameType extends string = string,
  ProgressType extends JobProgress = JobProgress,
> extends EventEmitter {
  readonly opts: WorkerOptions;
  readonly id: string;
  readonly name: string;

  closing: Promise<void> | undefined;

  private abortDelayController: AbortController | null = null;
  private blockUntil = 0;
  private _concurrency: number;
  private drained = false;
  private limitUntil = 0;
  protected lockManager: LockManager;
  private processorAcceptsSignal = false;
  private waiting: Promise<number> | null = null;

  protected paused: boolean;
  protected processFn: Processor<DataType, ResultType, NameType, ProgressType>;
  protected running = false;
  protected mainLoopRunning: Promise<void> | null = null;

  constructor(
    name: string,
    processor: Processor<DataType, ResultType, NameType, ProgressType>,
    protected backend: QueueBackend<DataType, ResultType, NameType, ProgressType>,
    opts: WorkerOptions = {},
  ) {
    super();
    this.name = name;
    this.opts = {
      concurrency: 1,
      lockDuration: 30000,
      maximumRateLimitDelay: 30000,
      runRetryDelay: 15000,
      ...opts,
    };
    this._concurrency = this.opts.concurrency;
    this.opts.lockRenewTime =
      this.opts.lockRenewTime || this.opts.lockDuration / 2;
    this.id = randomUUID();
    this.processFn = processor;
    this.processorAcceptsSignal = processor.length > 2;
    this.createLockManager();
  }

  /**
   * Creates and configures the lock manager for processing jobs.
   * This method can be overridden in subclasses to customize lock manager behavior.
   */
  protected createLockManager() {
    this.lockManager = new LockManager(this as LockManagerWorkerContext, {
      lockRenewTime: this.opts.lockRenewTime,
      lockDuration: this.opts.lockDuration,
      workerId: this.id,
      workerName: this.opts.name,
    });
  }

  async extendJobLocks(
    jobIds: string[],
    tokens: string[],
    duration: number,
  ): Promise<string[]> {
    return this.backend.extendLocks(jobIds, tokens, duration);
  }

  protected callProcessJob(
    job: Job<DataType, ResultType, NameType, ProgressType>,
    token: string,
    signal?: AbortSignal,
  ): Promise<ResultType> {
    return this.processFn(job, token, signal);
  }

  async run() {
    if (!this.processFn) {
      throw new Error('No process function is defined.');
    }

    if (this.running) {
      throw new Error('Worker is already running.');
    }

    try {
      this.running = true;

      if (this.closing || this.paused) {
        return;
      }

      if (!this.opts.skipLockRenewal) {
        this.lockManager.start();
      }

      this.mainLoopRunning = this.mainLoop();

      // We must await here or finally will be called too early.
      await this.mainLoopRunning;
    } finally {
      this.running = false;
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const limitUntil = this.limitUntil;
    if (limitUntil > Date.now()) {
      this.abortDelayController?.abort();
      this.abortDelayController = new AbortController();

      await delay(
        Math.min(limitUntil - Date.now(), this.opts.maximumRateLimitDelay),
        this.abortDelayController,
      );
      this.drained = false;
      this.limitUntil = 0;
    }
  }

  /**
   * This is the main loop in BullMQ. Its goals are to fetch jobs from the queue
   * as efficiently as possible, providing concurrency and minimal unnecessary calls
   * to Redis.
   */
  private async mainLoop() {
    const asyncFifoQueue = new AsyncFifoQueue<void | Job<
      DataType,
      ResultType,
      NameType,
      ProgressType
    >>();

    let tokenPostfix = 0;

    while ((!this.closing && !this.paused) || asyncFifoQueue.numTotal() > 0) {
      /**
       * This inner loop tries to fetch jobs concurrently, but if we are waiting for a job
       * to arrive at the queue we should not try to fetch more jobs (as it would be pointless)
       */
      while (
        !this.closing &&
        !this.paused &&
        !this.waiting &&
        asyncFifoQueue.numTotal() < this._concurrency &&
        !this.isRateLimited()
      ) {
        const token = `${this.id}:${tokenPostfix++}`;

        const fetchedJob = this.retryIfFailed<void | Job<
          DataType,
          ResultType,
          NameType,
          ProgressType
        >>(() => this._getNextJob(token, { block: true }), {
          delayInMs: this.opts.runRetryDelay,
          onlyEmitError: true,
        });
        asyncFifoQueue.add(fetchedJob);

        if (this.waiting && asyncFifoQueue.numTotal() > 1) {
          // We are waiting for jobs but we have others that we could start processing already
          break;
        }

        // We await here so that we fetch jobs in sequence, this is important to avoid unnecessary calls
        // to Redis in high concurrency scenarios.
        const job = await fetchedJob;

        // No more jobs waiting but we have others that could start processing already
        if (!job && asyncFifoQueue.numTotal() > 1) {
          break;
        }

        // If there are potential jobs to be processed and blockUntil is set, we should exit to avoid waiting
        // for processing this job.
        if (this.blockUntil) {
          break;
        }
      }

      // Since there can be undefined jobs in the queue (when a job fails or queue is empty)
      // we iterate until we find a job.
      let job: Job<DataType, ResultType, NameType, ProgressType> | void;
      do {
        job = await asyncFifoQueue.fetch();
      } while (!job && asyncFifoQueue.numQueued() > 0);

      if (job) {
        const token = job.token;
        asyncFifoQueue.add(
          this.processJob(
            <Job<DataType, ResultType, NameType, ProgressType>>job,
            token,
            () => asyncFifoQueue.numTotal() <= this._concurrency,
          ),
        );
      } else if (asyncFifoQueue.numQueued() === 0) {
        await this.waitForRateLimit();
      }
    }
  }

  private async _getNextJob(
    token: string,
    { block = true }: GetNextJobOptions = {},
  ): Promise<Job<DataType, ResultType, NameType, ProgressType> | undefined> {
    if (this.paused) {
      return;
    }

    if (this.closing) {
      return;
    }

    let job: Job<DataType, ResultType, NameType, ProgressType> | undefined;
    if (this.drained && block && !this.limitUntil && !this.waiting) {
      this.waiting = this.backend.waitForJob(this.blockUntil);
      try {
        this.blockUntil = await this.waiting;

        if (this.blockUntil <= 0 || this.blockUntil - Date.now() < 1) {
          job = await this.moveToActive(token, this.opts.name);
        }
      } finally {
        this.waiting = null;
      }
    } else {
      if (!this.isRateLimited()) {
        job = await this.moveToActive(token, this.opts.name);
      }
    }

    return job;
  }

  private isRateLimited(): boolean {
    return this.limitUntil > Date.now();
  }

  protected async moveToActive(
    token: string,
    name?: string,
  ): Promise<Job<DataType, ResultType, NameType, ProgressType>> {
    const job = await this.backend.getNextJob(token, name);
    return this.nextJobFromJobData(job, token);
  }

  protected nextJobFromJobData(
    job?: Job<DataType, ResultType, NameType, ProgressType>,
    token?: string,
  ): Job<DataType, ResultType, NameType, ProgressType> | undefined {
    if (!job) {
      if (!this.drained) {
        this.emit('drained');
        this.drained = true;
      }
    } else {
      this.drained = false;
      job.token = token;

      this.emit('active', job, 'waiting');

      return job;
    }
  }

  async processJob(
    job: Job<DataType, ResultType, NameType, ProgressType>,
    token: string,
    fetchNextCallback = () => true,
  ): Promise<void | Job<DataType, ResultType, NameType, ProgressType>> {
    const abortController = this.lockManager.trackJob(
      job.id,
      token,
      job.processedOn,
      this.processorAcceptsSignal,
    );

    try {
      const unrecoverableErrorMessage = this.getUnrecoverableErrorMessage(job);
      if (unrecoverableErrorMessage) {
        const failed = await this.retryIfFailed<void | Job<
          DataType,
          ResultType,
          NameType,
          ProgressType
        >>(
          () => {
            this.lockManager.untrackJob(job.id);
            return this.handleFailed(
              new UnrecoverableError(unrecoverableErrorMessage),
              job,
              token,
              fetchNextCallback,
            );
          },
          { delayInMs: this.opts.runRetryDelay },
        );
        return failed;
      }

      const result = await this.callProcessJob(
        job,
        token,
        abortController ? (abortController.signal as AbortSignal) : undefined,
      );
      return await this.retryIfFailed<void | Job<
        DataType,
        ResultType,
        NameType,
        ProgressType
      >>(
        () => {
          this.lockManager.untrackJob(job.id);
          return this.handleCompleted(result, job, token, fetchNextCallback);
        },
        { delayInMs: this.opts.runRetryDelay },
      );
    } catch (err) {
      const failed = await this.retryIfFailed<void | Job<
        DataType,
        ResultType,
        NameType,
        ProgressType
      >>(
        () => {
          this.lockManager.untrackJob(job.id);
          return this.handleFailed(<Error>err, job, token, fetchNextCallback);
        },
        { delayInMs: this.opts.runRetryDelay, onlyEmitError: true },
      );
      return failed;
    } finally {
      this.lockManager.untrackJob(job.id);
    }
  }

  private getUnrecoverableErrorMessage(
    job: Job<DataType, ResultType, NameType, ProgressType>,
  ) {
    if (job.deferredFailure) {
      return job.deferredFailure;
    }
    if (
      this.opts.maxStartedAttempts &&
      this.opts.maxStartedAttempts < job.attemptsStarted
    ) {
      return 'job started more than allowable limit';
    }
  }

  protected async handleCompleted(
    result: ResultType,
    job: Job<DataType, ResultType, NameType, ProgressType>,
    token: string,
    fetchNextCallback = () => true,
  ) {
    if (!this.backend.closing) {
      const completed = await job.moveToCompleted(
        result,
        token,
        fetchNextCallback() && !(this.closing || this.paused),
      );
      this.emit('completed', job, result, 'active');

      if (completed) {
        return this.nextJobFromJobData(completed, token);
      }
    }
  }

  protected async handleFailed(
    err: Error,
    job: Job<DataType, ResultType, NameType, ProgressType>,
    token: string,
    fetchNextCallback = () => true,
  ) {
    if (!this.backend.closing) {
      // Check if the job was manually rate-limited
      if (err.message === RATE_LIMIT_ERROR) {
        const rateLimitTtl = await this.backend.moveJobFromActiveToWait(
          job.id,
          token,
        );
        this.limitUntil = rateLimitTtl > 0 ? Date.now() + rateLimitTtl : 0;
        return;
      }

      const fetchNext = fetchNextCallback() && !(this.closing || this.paused);
      if (
        err instanceof DelayedError ||
        err.name == 'DelayedError' ||
        err instanceof WaitingError ||
        err.name == 'WaitingError' ||
        err instanceof WaitingChildrenError ||
        err.name == 'WaitingChildrenError'
      ) {
        if (!fetchNext) {
          return;
        }

        return this.moveToActive(token, this.opts.name);
      }

      const result = await job.moveToFailed(err, token, fetchNext);

      this.emit('failed', job, err, 'active');

      // Note: result can be undefined if moveToFailed fails (e.g., lock was lost)
      if (result) {
        return this.nextJobFromJobData(result, token);
      }
    }
  }

  private async retryIfFailed<T>(
    fn: () => Promise<T>,
    opts: { delayInMs: number; onlyEmitError?: boolean },
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isNotConnectionError(<Error>err)) {
        if (!this.paused && !this.closing) {
          this.emit('error', <Error>err);
        }
        if (opts.onlyEmitError) {
          return;
        }
        throw err;
      }
      // Connection errors are retried once after a delay
      await delay(opts.delayInMs, this.abortDelayController);
      return fn();
    }
  }
}
