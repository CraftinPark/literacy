import type { JSONValue } from './stubs.js';
import { search } from './stubs.js';
import type { Handler } from './stubs.js';
import { IdempotencyRecordStatus, MAX_RETRIES } from './constants.js';
import {
  IdempotencyAlreadyInProgressError,
  IdempotencyInconsistentStateError,
  type IdempotencyItemAlreadyExistsError,
  IdempotencyPersistenceLayerError,
  IdempotencyUnknownError,
} from './errors.js';
import type { IdempotencyConfig } from './IdempotencyConfig.js';
import type { BasePersistenceLayer } from './persistence/BasePersistenceLayer.js';
import type { IdempotencyRecord } from './persistence/IdempotencyRecord.js';
import type { IdempotencyRecordIdentity } from './types.js';
import type {
  AnyFunction,
  IdempotencyHandlerOptions,
} from './types.js';

/**
 * @internal
 *
 * Class that handles the idempotency lifecycle.
 *
 * This class is used under the hood by the Idempotency utility
 * and provides several methods that are called at different stages
 * to orchestrate the idempotency logic.
 */
export class IdempotencyHandler<Func extends AnyFunction> {
  readonly #functionArguments: unknown[];
  #functionPayloadToBeHashed: JSONValue;
  #recordIdentity?: IdempotencyRecordIdentity;
  readonly #functionToMakeIdempotent: AnyFunction;
  readonly #idempotencyConfig: IdempotencyConfig;
  readonly #resolvedKeyPrefix: string;
  readonly #persistenceStore: BasePersistenceLayer;
  readonly #thisArg?: Handler;

  public constructor(options: IdempotencyHandlerOptions) {
    const {
      functionToMakeIdempotent,
      functionPayloadToBeHashed,
      idempotencyConfig,
      functionArguments,
      persistenceStore,
      keyPrefix,
      thisArg,
    } = options;
    this.#functionToMakeIdempotent = functionToMakeIdempotent;
    this.#functionPayloadToBeHashed = functionPayloadToBeHashed;
    this.#idempotencyConfig = idempotencyConfig;
    this.#functionArguments = functionArguments;
    this.#thisArg = thisArg;

    this.#persistenceStore = persistenceStore;

    this.#persistenceStore.configure({
      config: this.#idempotencyConfig,
      keyPrefix,
    });
    this.#resolvedKeyPrefix = this.#persistenceStore.idempotencyKeyPrefix;
  }

  /**
   * Takes an idempotency key and returns the idempotency record from the persistence layer.
   *
   * If a response hook is provided in the idempotency configuration, it will be called before returning the response.
   *
   * If the idempotency record is not COMPLETE, then it will throw an error based on the status of the record.
   *
   * @param idempotencyRecord The idempotency record stored in the persistence layer
   * @returns The result of the function if the idempotency record is in a terminal state
   */
  public determineResultFromIdempotencyRecord(
    idempotencyRecord: IdempotencyRecord
  ): JSONValue {
    if (idempotencyRecord.getStatus() === IdempotencyRecordStatus.EXPIRED) {
      throw new IdempotencyInconsistentStateError(
        'Item has expired during processing and may not longer be valid.'
      );
    }
    if (idempotencyRecord.getStatus() === IdempotencyRecordStatus.INPROGRESS) {
      if (
        idempotencyRecord.inProgressExpiryTimestamp &&
        idempotencyRecord.inProgressExpiryTimestamp <
          new Date().getUTCMilliseconds()
      ) {
        throw new IdempotencyInconsistentStateError(
          'Item is in progress but the in progress expiry timestamp has expired.'
        );
      }
      throw new IdempotencyAlreadyInProgressError(
        `There is already an execution in progress with idempotency key: ${idempotencyRecord.idempotencyKey}${
          idempotencyRecord.sortKey
            ? ` and sort key: ${idempotencyRecord.sortKey}`
            : ''
        }`
      );
    }

    const response = idempotencyRecord.getResponse();

    // If a response hook is provided, call it to allow the user to modify the response
    if (this.#idempotencyConfig.responseHook) {
      return this.#idempotencyConfig.responseHook(response, idempotencyRecord);
    }

    return response;
  }

  /**
   * Execute the handler and return the result.
   *
   * If the handler fails, the idempotency record will be deleted.
   * If it succeeds, the idempotency record will be updated with the result.
   *
   * @returns The result of the function execution
   */
  public async getFunctionResult(): Promise<ReturnType<Func>> {
    let result: ReturnType<Func>;
    try {
      result = await this.#functionToMakeIdempotent.apply(
        this.#thisArg,
        this.#functionArguments
      );
    } catch (error) {
      await this.#deleteInProgressRecord();
      throw error;
    }
    await this.#saveSuccessfulResult(result);

    return result;
  }

  /**
   * Entry point to handle the idempotency logic.
   *
   * Before the handler is executed, we need to check if there is already an
   * execution in progress for the given idempotency key. If there is, we
   * need to determine its status and return the appropriate response or
   * throw an error.
   *
   * If there is no execution in progress, we need to save a record to the
   * idempotency store to indicate that an execution is in progress.
   *
   * In some rare cases, when the persistent state changes in small time
   * window, we might get an `IdempotencyInconsistentStateError`. In such
   * cases we can safely retry the handling a few times.
   */
  public async handle({
    isReplay,
  }: {
    isReplay?: boolean;
  } = {}): Promise<ReturnType<Func>> {
    // early return if we should skip idempotency completely
    if (this.shouldSkipIdempotency()) {
      return await this.#functionToMakeIdempotent.apply(
        this.#thisArg,
        this.#functionArguments
      );
    }

    let e: Error | undefined;
    for (let retryNo = 0; retryNo <= MAX_RETRIES; retryNo++) {
      try {
        const { isIdempotent, result } =
          await this.#saveInProgressOrReturnExistingResult({ isReplay });
        if (isIdempotent) return result as ReturnType<Func>;

        return await this.getFunctionResult();
      } catch (error) {
        if (!(error instanceof Error))
          throw new IdempotencyUnknownError(
            'An unknown error occurred while processing the request.',
            { cause: error }
          );
        if (
          error.name === 'IdempotencyInconsistentStateError' &&
          retryNo < MAX_RETRIES
        ) {
          // Retry
          continue;
        }
        // Retries exhausted or other error
        e = error;
        break;
      }
    }
    throw e;
  }

  /**
   * Avoid idempotency if the eventKeyJmesPath is not present in the payload and throwOnNoIdempotencyKey is false
   */
  public shouldSkipIdempotency(): boolean {
    if (!this.#idempotencyConfig.isEnabled()) return true;

    if (
      this.#idempotencyConfig.eventKeyJmesPath !== '' &&
      !this.#idempotencyConfig.throwOnNoIdempotencyKey
    ) {
      const selection = search(
        this.#idempotencyConfig.eventKeyJmesPath,
        this.#functionPayloadToBeHashed,
        this.#idempotencyConfig.jmesPathOptions
      );

      return selection === undefined || selection === null;
    }

    return false;
  }

  /**
   * Restore this operation's key prefix on the persistence store.
   *
   * Operations sharing a store reconfigure its prefix on construction, so it
   * is re-applied immediately before each call that hashes a key.
   */
  readonly #applyKeyPrefix = (): void => {
    this.#persistenceStore.idempotencyKeyPrefix = this.#resolvedKeyPrefix;
  };

  /**
   * Delete an in progress record from the idempotency store.
   *
   * This is called when the handler throws an error.
   */
  readonly #deleteInProgressRecord = async (): Promise<void> => {
    try {
      await this.#persistenceStore.deleteRecord(
        this.#functionPayloadToBeHashed,
        { identity: this.#recordIdentity }
      );
    } catch (error) {
      throw new IdempotencyPersistenceLayerError(
        'Failed to delete record from idempotency store',
        { cause: error }
      );
    }
  };

  /**
   * Save an in progress record to the idempotency store or return an stored result.
   *
   * Before returning a result, we might neede to look up the idempotency record
   * and validate it to ensure that it is consistent with the payload to be hashed.
   */
  readonly #saveInProgressOrReturnExistingResult = async ({
    isReplay,
  }: {
    isReplay?: boolean;
  } = {}): Promise<{
    isIdempotent: boolean;
    result: JSONValue;
  }> => {
    const returnValue: {
      isIdempotent: boolean;
      result: JSONValue;
    } = {
      isIdempotent: false,
      result: undefined,
    };
    try {
      this.#applyKeyPrefix();
      // Resolve the identity before attempting acquisition so that it is also
      // available when the function runs without acquiring a record (replay).
      this.#recordIdentity = this.#persistenceStore.getRecordIdentity(
        this.#functionPayloadToBeHashed
      );
      await this.#persistenceStore.saveInProgress(
        this.#functionPayloadToBeHashed,
        this.#idempotencyConfig.lambdaContext?.getRemainingTimeInMillis(),
        { identity: this.#recordIdentity }
      );

      return returnValue;
    } catch (error) {
      if (!(error instanceof Error))
        throw new IdempotencyUnknownError(
          'An unknown error occurred while processing the request.',
          { cause: error }
        );
      if (error.name === 'IdempotencyItemAlreadyExistsError') {
        if (isReplay) {
          return returnValue;
        }

        let idempotencyRecord = (error as IdempotencyItemAlreadyExistsError)
          .existingRecord;
        if (idempotencyRecord === undefined) {
          // If the error doesn't include the existing record, we need to fetch
          // it from the persistence layer. In doing so, we also call the processExistingRecord
          // method to validate the record and cache it in memory.
          this.#applyKeyPrefix();
          idempotencyRecord = await this.#persistenceStore.getRecord(
            this.#functionPayloadToBeHashed
          );
        } else {
          // If the error includes the existing record, we can use it to validate
          // the record being processed and cache it in memory.
          idempotencyRecord = this.#persistenceStore.processExistingRecord(
            idempotencyRecord,
            this.#functionPayloadToBeHashed
          );
        }

        returnValue.isIdempotent = true;
        returnValue.result =
          this.determineResultFromIdempotencyRecord(idempotencyRecord);

        return returnValue;
      }
      throw new IdempotencyPersistenceLayerError(
        'Failed to save in progress record to idempotency store',
        { cause: error }
      );
    }
  };

  /**
   * Save a successful result to the idempotency store.
   *
   * This is called when the handler returns successfully.
   *
   * @param result The result returned by the handler.
   */
  readonly #saveSuccessfulResult = async (
    result: ReturnType<Func>
  ): Promise<void> => {
    try {
      await this.#persistenceStore.saveSuccess(
        this.#functionPayloadToBeHashed,
        result,
        { identity: this.#recordIdentity }
      );
    } catch (error) {
      throw new IdempotencyPersistenceLayerError(
        'Failed to update success record to idempotency store',
        { cause: error }
      );
    }
  };
}
