// Types gathered from the package's types/ folder (BasePersistenceLayer.ts, IdempotencyRecord.ts,
// IdempotencyOptions.ts), limited to the ones these files use.
import type { IdempotencyRecordStatus } from './constants.js';
import type { IdempotencyConfig } from './IdempotencyConfig.js';
import type { BasePersistenceLayer } from './persistence/BasePersistenceLayer.js';
import type { IdempotencyRecord } from './persistence/IdempotencyRecord.js';
import type { Context, Functions, Handler, JSONValue } from './stubs.js';

type BasePersistenceLayerOptions = {
  config: IdempotencyConfig;
  functionName?: string;
  keyPrefix?: string;
};

type IdempotencyRecordIdentity = Pick<
  IdempotencyRecord,
  'idempotencyKey' | 'payloadHash'
>;

type PersistenceOperationOptions = {
  identity?: IdempotencyRecordIdentity;
};

interface BasePersistenceLayerInterface {
  configure(options?: BasePersistenceLayerOptions): void;
  isPayloadValidationEnabled(): boolean;
  saveInProgress(
    data: unknown,
    remainingTimeInMillis?: number,
    options?: PersistenceOperationOptions
  ): Promise<void>;
  saveSuccess(
    data: unknown,
    result: unknown,
    options?: PersistenceOperationOptions
  ): Promise<void>;
  deleteRecord(
    data: unknown,
    options?: PersistenceOperationOptions
  ): Promise<void>;
  getRecord(data: unknown): Promise<IdempotencyRecord>;
}

interface BasePersistenceAttributes {
  expiryAttr?: string;
  inProgressExpiryAttr?: string;
  statusAttr?: string;
  dataAttr?: string;
  validationKeyAttr?: string;
}

type IdempotencyRecordStatusValue =
  (typeof IdempotencyRecordStatus)[keyof typeof IdempotencyRecordStatus];

type IdempotencyRecordOptions = {
  idempotencyKey: string;
  sortKey?: string;
  status: IdempotencyRecordStatusValue;
  expiryTimestamp?: number;
  inProgressExpiryTimestamp?: number;
  responseData?: JSONValue;
  payloadHash?: string;
};

// biome-ignore lint/suspicious/noExplicitAny: This is a generic type that is intentionally open
type AnyFunction = (...args: Array<any>) => any;

type IdempotencyHandlerOptions = {
  functionArguments: unknown[];
  functionPayloadToBeHashed: JSONValue;
  functionToMakeIdempotent: AnyFunction;
  idempotencyConfig: IdempotencyConfig;
  keyPrefix?: string;
  persistenceStore: BasePersistenceLayer;
  thisArg?: Handler;
};

type ResponseHook = (
  response: JSONValue,
  record: IdempotencyRecord
) => JSONValue;

type IdempotencyConfigOptions = {
  eventKeyJmesPath?: string;
  payloadValidationJmesPath?: string;
  jmesPathOptions?: Functions;
  throwOnNoIdempotencyKey?: boolean;
  expiresAfterSeconds?: number;
  useLocalCache?: boolean;
  maxLocalCacheSize?: number;
  hashFunction?: string;
  lambdaContext?: Context;
  responseHook?: ResponseHook;
};

export type {
  AnyFunction,
  BasePersistenceAttributes,
  BasePersistenceLayerInterface,
  BasePersistenceLayerOptions,
  IdempotencyConfigOptions,
  IdempotencyHandlerOptions,
  IdempotencyRecordIdentity,
  IdempotencyRecordOptions,
  IdempotencyRecordStatusValue,
  PersistenceOperationOptions,
  ResponseHook,
};
