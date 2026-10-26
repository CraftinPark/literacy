# Ticket TIX-4182: the Hollow Coast presale oversold

*A ReadCode problem. Backend, about 30 minutes. Made by Danny for John.*

## The ticket

> **From:** Venue operations, Riverside Hall
> **Priority:** P1
>
> Riverside Hall holds 1,200. Your system confirmed **1,214** tickets for the Hollow Coast presale on Saturday. Fourteen people turned up with valid, paid tickets and no seat. We have sold through you for two years and this has never happened. A few fans also say the event page still showed "3 left" after we had sold out.

## What on-call has found so far

- The `orders` table has 1,214 confirmed seats for event 88. Every extra order is paid (captured) and belongs to a different customer; no `request_id` appears twice.
- The unit tests all pass, including `test_hold_refuses_the_last_seat_twice`, which starts two threads that try to buy the last seat at the same time and checks that only one succeeds.
- Nothing was deployed in the week before the sale except configuration.
- A slice of the worker logs around the moment the event sold out (`tickets.inventory` logs every hold; pids differ per process):

```
10:00:41.188 tickets.worker    confirmed order=91817 qty=1 amount=7500
10:00:41.201 tickets.inventory event=88 seats_left=3 want=2 worker=tickets-worker-a:4121
10:00:41.209 tickets.inventory event=88 seats_left=3 want=1 worker=tickets-worker-b:3377
10:00:41.214 tickets.inventory event=88 seats_left=3 want=2 worker=tickets-worker-a:4188
10:00:41.226 tickets.inventory event=88 seats_left=3 want=1 worker=tickets-worker-b:3390
10:00:41.240 tickets.inventory event=88 seats_left=3 want=4 worker=tickets-worker-a:4160
10:00:41.297 tickets.worker    confirmed order=91821 qty=2 amount=15000
10:00:41.305 tickets.worker    confirmed order=91822 qty=1 amount=7500
10:00:41.311 tickets.worker    confirmed order=91823 qty=2 amount=15000
10:00:41.334 tickets.worker    confirmed order=91824 qty=1 amount=7500
10:00:41.351 tickets.inventory event=88 seats_left=-3 want=2 worker=tickets-worker-b:3377
```

## The code

A small purchase service: the API (not included) puts each purchase on a job queue, and purchase workers take jobs off it. Start with `tickets/worker.py`.

| File | What it is |
|---|---|
| `tickets/worker.py` | The purchase worker: hold seats, authorize the card, confirm, capture |
| `tickets/inventory.py` | Counting seats and holding them |
| `tickets/jobqueue.py` | The job queue, in a database table |
| `tickets/cache.py` | A short-lived "seats left" cache |
| `tickets/pricing.py` | Client for the pricing service |
| `tickets/payments.py` | Client for the card provider |
| `tickets/db.py` | Schema and connections (Postgres in production, SQLite locally) |
| `deploy/worker.toml` | How the workers run in production |
| `simulate.py` | Replays a flash sale locally |

## Run it

It needs only Python 3.10 or newer, no packages:

```
python simulate.py
python simulate.py --workers 1
python simulate.py --buyers 400 --capacity 300 --verbose
```

Each run prints how many seats were confirmed and leaves a SQLite database you can open with `sqlite3`. You can change the code and rerun as much as you like.

## Questions

Answer all three. Each has one correct answer.

**Q1. Where.** Which lines let the extra seats through? Give the file and a line range (within about 3 lines is fine).

**Q2. Why.** What is the cause?

- A. The "seats left" cache is up to 5 seconds old, so workers keep selling seats that are already gone.
- B. The job queue can hand the same purchase to two workers, so some purchases are processed twice.
- C. The lock only stops two threads in the same process from interleaving. Production runs several worker processes on two hosts, so workers can each read the same seat count before any of them inserts its hold.
- D. A payment timeout is retried, and each retry creates a second order for the same purchase.

**Q3. Fix.** Which change fixes it?

- A. Replace `threading.Lock()` with `multiprocessing.Lock()`, so the lock is shared between worker processes.
- B. Set `processes = 1` in `deploy/worker.toml`.
- C. Set the cache TTL to 0, so workers never act on a stale seat count.
- D. Make the check and the insert one database transaction that takes the lock in the database before reading the count (`BEGIN IMMEDIATE` in SQLite; `SELECT ... FOR UPDATE` on the event row in Postgres), and call the pricing service before it starts.

Write your answers as, for example, `Q1 tickets/foo.py 10-20, Q2 A, Q3 B`, along with how long it took you. Afterwards, bring the TL;DR from our plan: what you solved, whether it was relevant for a backend job seeker, whether it felt authentic and why, and what could be improved.
