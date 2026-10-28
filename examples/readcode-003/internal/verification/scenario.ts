// Bug-report scenario: a service that is down; retry with exponential backoff and record the delays.
import { ExponentialBackoff } from './backoff/ExponentialBackoff.js';
import { noJitterGenerator } from './backoff/ExponentialBackoffGenerators.js';
import { handleAll, retry } from './Policy.js';

async function main() {
  const policy = retry(handleAll, {
    maxAttempts: 5,
    backoff: new ExponentialBackoff({ generator: noJitterGenerator, initialDelay: 50, maxDelay: 5000 }),
  });

  const delays: number[] = [];
  policy.onRetry(({ delay }) => delays.push(delay));

  let calls = 0;
  const start = Date.now();
  try {
    await policy.execute(() => {
      calls++;
      throw new Error('503 Service Unavailable');
    });
  } catch (err) {
    console.log(`gave up with: ${(err as Error).message}`);
  }
  const elapsed = Date.now() - start;
  console.log(`calls to the service: ${calls}`);
  console.log(`delay before each retry (ms): ${delays.join(', ')}`);
  console.log(`total time spent retrying: ${elapsed >= 1000 ? 'about 1.5 s' : 'about 0.25 s'}`);
}

main();
