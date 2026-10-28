// Bug-report scenario: map 10 items with poolLimit 2 and record how many calls run at once.
import { pooledMap } from './pool';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
  let inFlight = 0;
  let maxInFlight = 0;
  const startedBeforeFirstResult: number[] = [];
  let firstResultSeen = false;

  const fetchItem = async (id: number) => {
    if (!firstResultSeen) startedBeforeFirstResult.push(id);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await sleep(20);
    inFlight--;
    return id * 10;
  };

  const results: number[] = [];
  for await (const r of pooledMap(2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fetchItem)) {
    firstResultSeen = true;
    results.push(r);
  }
  console.log(`results: ${results.join(', ')}`);
  console.log(`most calls running at the same time: ${maxInFlight}`);
  console.log(`items started before the first result came back: ${startedBeforeFirstResult.join(', ')}`);
}

main();
