"""Purchase worker: claims purchase jobs from the queue and runs them.

One purchase: (cache says sold out? stop) -> hold seats -> authorize card ->
confirm order -> capture payment. A failed authorization releases the hold.
deploy/worker.toml says how many of these run in production.
"""
import json
import logging
import os
import socket
import time

from . import cache, db, inventory, jobqueue, payments

log = logging.getLogger("tickets.worker")


def worker_name() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def handle_purchase(conn, payload: dict, name: str) -> dict:
    event_id, qty, customer = payload["event_id"], payload["qty"], payload["customer"]
    key = payload["request_id"]          # the client's idempotency key

    cached = cache.get_seats_left(event_id)
    if cached is not None and cached < qty:
        return {"outcome": "sold_out", "source": "cache"}

    try:
        order_id, amount = inventory.hold(conn, event_id, customer, qty, name)
    except inventory.SoldOut:
        cache.put_seats_left(event_id, 0)
        return {"outcome": "sold_out"}

    try:
        auth = payments.authorize(customer, amount, key)
    except payments.Declined:
        inventory.release(conn, order_id)
        return {"outcome": "declined", "order": order_id}
    except payments.ProviderTimeout:
        inventory.release(conn, order_id)
        raise

    inventory.confirm(conn, order_id, auth)
    payments.capture(auth, key)
    cache.put_seats_left(event_id, inventory.seats_left(conn, event_id))
    log.info("confirmed order=%s qty=%s amount=%s", order_id, qty, amount)
    return {"outcome": "confirmed", "order": order_id, "amount_cents": amount}


def run(db_path: str, stop_when_empty: bool = False, poll_ms: int = 50, log_level: str = "WARNING") -> None:
    logging.basicConfig(level=log_level, format="%(asctime)s %(name)s %(message)s")
    conn = db.connect(db_path)
    name = worker_name()
    while True:
        job = jobqueue.claim(conn, name)
        if job is None:
            if stop_when_empty:
                return
            time.sleep(poll_ms / 1000)
            continue
        try:
            result = handle_purchase(conn, json.loads(job["payload"]), name)
            jobqueue.finish(conn, job["id"], "done", result)
        except Exception as e:
            log.exception("job %s failed", job["id"])
            jobqueue.finish(conn, job["id"], "failed", {"error": repr(e)})
