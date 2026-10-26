"""Replay a flash sale against a local copy of the service.

    python simulate.py                    # 4 worker processes, like one production host
    python simulate.py --workers 1
    python simulate.py --buyers 300 --capacity 200 --seed 7 --verbose

Creates a fresh SQLite database with one event and one purchase job per buyer,
starts the workers, waits until the queue is empty, and prints what was sold.
Needs only the Python standard library (3.10+).
"""
import argparse
import multiprocessing
import os
import random
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tickets import db, jobqueue, worker  # noqa: E402


def setup(path: str, capacity: int, buyers: int, seed: int) -> int:
    db.init(path)
    conn = db.connect(path)
    event_id = db.create_event(conn, "Hollow Coast", "Riverside Hall", capacity, 6500)
    rng = random.Random(seed)
    for i in range(buyers):
        qty = rng.choices([1, 2, 3, 4], weights=[60, 25, 10, 5])[0]
        domain = "declined.test" if rng.random() < 0.03 else "example.test"
        jobqueue.enqueue(conn, "purchase", {"request_id": f"req-{i:05d}", "event_id": event_id,
                                            "customer": f"buyer{i:04d}@{domain}", "qty": qty})
    conn.close()
    return event_id


def report(path: str, event_id: int) -> dict:
    conn = db.connect(path)
    event = db.get_event(conn, event_id)
    sold = conn.execute("SELECT COALESCE(SUM(qty), 0) FROM orders WHERE event_id = ? AND status = 'confirmed'",
                        (event_id,)).fetchone()[0]
    by_worker = conn.execute("SELECT worker, COUNT(*) AS orders, SUM(qty) AS seats FROM orders "
                             "WHERE event_id = ? AND status = 'confirmed' GROUP BY worker ORDER BY worker",
                             (event_id,)).fetchall()
    jobs = jobqueue.counts(conn)
    conn.close()
    return {"capacity": event["capacity"], "sold": sold, "jobs": jobs,
            "by_worker": [(r["worker"], r["orders"], r["seats"]) for r in by_worker]}


def run(workers: int = 4, capacity: int = 100, buyers: int = 160, seed: int = 1, db_path=None, verbose=False) -> dict:
    path = db_path or os.path.join(tempfile.mkdtemp(prefix="flash-sale-"), "tickets.db")
    event_id = setup(path, capacity, buyers, seed)
    level = "INFO" if verbose else "WARNING"
    procs = [multiprocessing.Process(target=worker.run, args=(path,),
                                     kwargs={"stop_when_empty": True, "log_level": level})
             for _ in range(workers)]
    started = time.monotonic()
    for p in procs:
        p.start()
    for p in procs:
        p.join()
    result = report(path, event_id)
    result.update(db=path, seconds=round(time.monotonic() - started, 1), workers=workers)
    return result


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--capacity", type=int, default=100)
    ap.add_argument("--buyers", type=int, default=160)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--db", help="keep the database at this path (default: a temp file)")
    ap.add_argument("--verbose", action="store_true", help="log every hold and confirmation")
    a = ap.parse_args(argv)
    r = run(a.workers, a.capacity, a.buyers, a.seed, a.db, a.verbose)
    print(f"{r['workers']} worker(s), {r['seconds']} s, jobs {r['jobs']}")
    for name, orders, seats in r["by_worker"]:
        print(f"  {name}: {orders} orders, {seats} seats")
    print(f"capacity {r['capacity']}, confirmed seats {r['sold']}")
    print(f"database: {r['db']}  (sqlite3 it to look around)")


if __name__ == "__main__":
    main()
