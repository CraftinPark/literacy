// Bug-report scenario: an idempotent payment handler, retried with the same order whose JSON keys
// arrive in a different order. A tiny in-memory store does the conditional write a real store does.
import { IdempotencyItemAlreadyExistsError } from './errors.js';
import { IdempotencyConfig } from './IdempotencyConfig.js';
import { IdempotencyHandler } from './IdempotencyHandler.js';
import { BasePersistenceLayer } from './persistence/BasePersistenceLayer.js';
import type { IdempotencyRecord } from './persistence/IdempotencyRecord.js';
import type { JSONValue } from './stubs.js';

class MemoryPersistenceLayer extends BasePersistenceLayer {
  readonly records = new Map<string, IdempotencyRecord>();

  protected async _putRecord(record: IdempotencyRecord): Promise<void> {
    const existing = this.records.get(record.idempotencyKey);
    if (existing && !existing.isExpired()) {
      throw new IdempotencyItemAlreadyExistsError(`Record exists: ${record.idempotencyKey}`, existing);
    }
    this.records.set(record.idempotencyKey, record);
  }
  protected async _getRecord(key: string): Promise<IdempotencyRecord> {
    const record = this.records.get(key);
    if (!record) throw new Error(`No record for ${key}`);
    return record;
  }
  protected async _updateRecord(record: IdempotencyRecord): Promise<void> {
    this.records.set(record.idempotencyKey, record);
  }
  protected async _deleteRecord(record: IdempotencyRecord): Promise<void> {
    this.records.delete(record.idempotencyKey);
  }
}

async function main() {
  const store = new MemoryPersistenceLayer();
  const config = new IdempotencyConfig({});
  config.registerLambdaContext({ getRemainingTimeInMillis: () => 30_000 });

  let charges = 0;
  const chargeCard = async (order: JSONValue) => {
    charges++;
    return { chargeId: `ch_${charges}`, order };
  };
  const call = (payload: JSONValue) =>
    new IdempotencyHandler({
      functionToMakeIdempotent: chargeCard,
      functionPayloadToBeHashed: payload,
      functionArguments: [payload],
      idempotencyConfig: config,
      persistenceStore: store,
    }).handle();

  const first = await call({ orderId: 'A-1001', amountCents: 2500, currency: 'EUR' });
  // The client times out and retries; the API gateway re-serialises the body with its keys in another order.
  const retry = await call({ currency: 'EUR', orderId: 'A-1001', amountCents: 2500 });

  console.log(`first call returned: ${first.chargeId}`);
  console.log(`retry returned: ${retry.chargeId}`);
  console.log(`times the card was charged: ${charges}`);
  console.log(`idempotency records stored: ${store.records.size}`);
}

main();
