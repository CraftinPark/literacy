import { ConstantBackoff, IBackoffFactory } from './backoff/Backoff.js';
import { Event } from './common/Event.js';
import { ExecuteWrapper } from './common/Executor.js';
import { IRetryBackoffContext, RetryPolicy } from './RetryPolicy.js';

type Constructor<T> = new (...args: any) => T;

const typeFilter = <T>(cls: Constructor<T>, predicate?: (error: T) => boolean) =>
  predicate ? (v: unknown) => v instanceof cls && predicate(v) : (v: unknown) => v instanceof cls;

const always = () => true;
const never = () => false;

export interface IBasePolicyOptions {
  errorFilter: (error: unknown) => boolean;
  resultFilter: (result: unknown) => boolean;
}

/**
 * The reason for a call failure. Either an error, or the a value that was
 * marked as a failure (when using result filtering).
 */
export type FailureReason<ReturnType> = { error: unknown } | { value: ReturnType };

/**
 * Event emitted on the `onFailure` calls.
 */
export interface IFailureEvent {
  /**
   * Call duration, in milliseconds (with nanosecond precision, as the OS allows).
   */
  duration: number;

  /**
   * Whether the error was handled by the policy.
   */
  handled: boolean;

  /**
   * The reason for the error.
   */
  reason: FailureReason<unknown>;
}

/**
 * Event emitted on the `onSuccess` calls.
 */
export interface ISuccessEvent {
  /**
   * Call duration, in milliseconds (with nanosecond precision, as the OS allows).
   */
  duration: number;
}

export interface IDefaultPolicyContext {
  /**
   * Abort signal for the operation. This is propagated through multiple
   * retry policies.
   */
  signal: AbortSignal;
}

/**
 * IPolicy is the type of all policies that Cockatiel provides. It describes
 * an execute() function which takes a generic argument.
 */
export interface IPolicy<
  ContextType extends IDefaultPolicyContext = IDefaultPolicyContext,
  AltReturn = never,
> {
  /**
   * Virtual property only used for TypeScript--will not actually be defined.
   * @deprecated This property does not exist
   */
  readonly _altReturn: AltReturn;

  /**
   * Fires on the policy when a request successfully completes and some
   * successful value will be returned. In a retry policy, this is fired once
   * even if the request took multiple retries to succeed.
   */
  readonly onSuccess: Event<ISuccessEvent>;

  /**
   * Fires on the policy when a request fails *due to a handled reason* fails
   * and will give rejection to the called.
   */
  readonly onFailure: Event<IFailureEvent>;

  /**
   * Runs the function through behavior specified by the policy.
   */
  execute<T>(
    fn: (context: ContextType) => PromiseLike<T> | T,
    signal?: AbortSignal,
  ): Promise<T | AltReturn>;
}

export class Policy {
  /**
   * Factory that builds a base set of filters that can be used in circuit
   * breakers, retries, etc.
   */
  constructor(public readonly options: Readonly<IBasePolicyOptions>) {}

  /**
   * Allows the policy to additionally handles errors of the given type.
   *
   * @param cls Class constructor to check that the error is an instance of.
   * @param predicate If provided, a function to be called with the error
   * which should return "true" if we want to handle this error.
   * @example
   * ```js
   * // retry both network errors and response errors with a 503 status code
   * new Policy()
   *  .orType(NetworkError)
   *  .orType(ResponseError, err => err.statusCode === 503)
   *  .retry()
   *  .attempts(3)
   *  .execute(() => getJsonFrom('https://example.com'));
   * ```
   */
  public orType<T>(cls: Constructor<T>, predicate?: (error: T) => boolean) {
    const filter = typeFilter(cls, predicate);
    return new Policy({
      ...this.options,
      errorFilter: e => this.options.errorFilter(e) || filter(e),
    });
  }

  /**
   * Allows the policy to additionally handles errors that pass the given
   * predicate function.
   *
   * @param predicate Takes any thrown error, and returns true if it should
   * be retried by this policy.
   * @example
   * ```js
   * // only retry if the error has a "shouldBeRetried" property set
   * new Policy()
   *  .orWhen(err => err.shouldBeRetried === true)
   *  .retry()
   *  .attempts(3)
   *  .execute(() => getJsonFrom('https://example.com'));
   * ```
   */
  public orWhen(predicate: (error: unknown) => boolean) {
    return new Policy({
      ...this.options,
      errorFilter: e => this.options.errorFilter(e) || predicate(e),
    });
  }

  /**
   * Adds handling for return values. The predicate will be called with
   * the return value of the executed function,
   *
   * @param predicate Takes the returned value, and returns true if it
   * should be retried by this policy.
   * @example
   * ```js
   * // retry when the response status code is a 5xx
   * new Policy()
   *  .orResultWhen(res => res.statusCode >= 500)
   *  .retry()
   *  .attempts(3)
   *  .execute(() => getJsonFrom('https://example.com'));
   * ```
   */
  public orWhenResult(predicate: (r: unknown) => boolean) {
    return new Policy({
      ...this.options,
      resultFilter: r => this.options.resultFilter(r) || predicate(r),
    });
  }
}

/**
 * A policy that handles all errors.
 */
export const handleAll = new Policy({ errorFilter: always, resultFilter: never });

/**
 * See {@link Policy.orType} for usage.
 */
export function handleType<T>(cls: Constructor<T>, predicate?: (error: T) => boolean) {
  return new Policy({ errorFilter: typeFilter(cls, predicate), resultFilter: never });
}

/**
 * See {@link Policy.orWhen} for usage.
 */
export function handleWhen(predicate: (error: unknown) => boolean) {
  return new Policy({ errorFilter: predicate, resultFilter: never });
}

/**
 * Creates a retry policy. The options should contain the backoff strategy to
 * use. Included strategies are:
 *  - {@link ConstantBackoff}
 *  - {@link ExponentialBackoff}
 *  - {@link IterableBackoff}
 *  - {@link DelegateBackoff} (advanced)
 *
 * For example:
 *
 * ```
 * import { handleAll, retry } from 'cockatiel';
 *
 * const policy = retry(handleAll, { backoff: new ExponentialBackoff() });
 * ```
 *
 * You can optionally pass in the `attempts` to limit the maximum number of
 * retry attempts per call.
 */
export function retry(
  policy: Policy,
  opts: {
    maxAttempts?: number;
    backoff?: IBackoffFactory<IRetryBackoffContext<unknown>>;
  },
) {
  return new RetryPolicy(
    { backoff: opts.backoff || new ConstantBackoff(0), maxAttempts: opts.maxAttempts ?? Infinity },
    new ExecuteWrapper(policy.options.errorFilter, policy.options.resultFilter),
  );
}
