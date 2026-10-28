"""Bug-report scenario: four messages sent in order through a queue of size 1, so three producers
have to wait for room. Also a priority queue, to check the worsened code behaves the same."""
import asyncio

from queues import PriorityQueue, Queue


async def main():
    q = Queue(maxsize=1)
    await q.put('m1')  # the queue is now full
    producers = []
    for message in ['m2', 'm3', 'm4']:
        producers.append(asyncio.create_task(q.put(message)))
        await asyncio.sleep(0)  # let this producer start waiting before the next one
    received = [await q.get() for _ in range(4)]
    await asyncio.gather(*producers)
    print('sent:     m1, m2, m3, m4')
    print('received: ' + ', '.join(received))

    pq = PriorityQueue()
    for item in [(2, 'report'), (1, 'page'), (3, 'cleanup'), (1, 'alert')]:
        pq.put_nowait(item)
    print('priority order: ' + ', '.join(f'{p}:{name}' for p, name in (pq.get_nowait() for _ in range(4))))


asyncio.run(main())
