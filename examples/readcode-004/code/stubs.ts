// Stand-ins for the parts of other Powertools packages (commons, jmespath) and of the
// AWS Lambda types that these files use. Only the behaviour these files rely on is kept.
//
// Not included: the concrete persistence stores (DynamoDB, Redis). Each implements the four
// abstract methods of BasePersistenceLayer. Their _putRecord is a conditional write: it
// succeeds only if no record exists for the key, or the existing record has expired, or it
// is INPROGRESS and its inProgressExpiryTimestamp has passed. Otherwise it throws
// IdempotencyItemAlreadyExistsError carrying the existing record. That conditional write is
// what makes two concurrent invocations with the same idempotency key safe.

type JSONPrimitive = string | number | boolean | null | undefined;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
type JSONObject = { [key: number | string]: JSONValue };
type JSONArray = Array<JSONValue>;

/** Returns 'object', 'array', 'string', 'number', 'boolean', 'null' or 'undefined'. */
const getType = (value: unknown): string => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
};

const getStringFromEnv = ({ key, defaultValue }: { key: string; defaultValue: string }): string =>
  process.env[key]?.trim() || defaultValue;

const getBooleanFromEnv = ({
  key,
  defaultValue,
}: { key: string; defaultValue: boolean; extendedParsing?: boolean }): boolean => {
  const value = process.env[key]?.trim().toLowerCase();
  if (value === undefined || value === '') return defaultValue;
  return ['1', 'true', 'on', 'yes', 'y'].includes(value);
};

/** Least-recently-used cache with a maximum number of entries. */
class LRUCache<K, V> {
  readonly #map = new Map<K, V>();
  readonly #maxSize: number;

  public constructor({ maxSize = 100 }: { maxSize?: number } = {}) {
    this.#maxSize = maxSize;
  }

  public add(key: K, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#maxSize) {
      this.#map.delete(this.#map.keys().next().value as K);
    }
  }

  public get(key: K): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) this.add(key, value);
    return value;
  }

  public has(key: K): boolean {
    return this.#map.has(key);
  }

  public remove(key: K): void {
    this.#map.delete(key);
  }
}

/** Custom JMESPath functions (unused here). */
type Functions = object;
type JMESPathParsingOptions = { customFunctions?: Functions };

/**
 * Evaluates a JMESPath expression. This stand-in supports plain dotted paths
 * such as `body.orderId`, which is all these exercises need.
 */
const search = (expression: string, data: unknown, _options?: JMESPathParsingOptions): unknown =>
  expression
    .split('.')
    .reduce<unknown>(
      (value, part) => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined),
      data
    );

/** The parts of the AWS Lambda context and handler types used here. */
type Context = { getRemainingTimeInMillis(): number };
type Handler = (event: unknown, context: Context) => unknown;

export { getBooleanFromEnv, getStringFromEnv, getType, LRUCache, search };
export type { Context, Functions, Handler, JMESPathParsingOptions, JSONArray, JSONObject, JSONValue };
