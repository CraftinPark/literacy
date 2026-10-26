"""Seat inventory: counting seats and holding them for a purchase.

A purchase holds its seats first, then authorizes the card, then confirms (see
worker.py). Held seats count as taken, so a slow card authorization can't let
someone else buy the same seat; a hold that fails payment is released.
"""
import logging
import threading

from . import db, pricing

log = logging.getLogger("tickets.inventory")

MAX_PER_ORDER = 8


class SoldOut(Exception):
    pass


class SalesClosed(Exception):
    pass


# Holds must not interleave: two buyers checking at the same moment could both
# see the last seat. Everything from the availability check to the insert runs
# under this lock.
_hold_lock = threading.Lock()


def seats_taken(conn, event_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(qty), 0) AS n FROM orders "
        "WHERE event_id = ? AND status IN ('held', 'confirmed')",
        (event_id,),
    ).fetchone()
    return row["n"]


def seats_left(conn, event_id: int) -> int:
    event = db.get_event(conn, event_id)
    return event["capacity"] - seats_taken(conn, event_id)


def hold(conn, event_id: int, customer: str, qty: int, worker: str) -> tuple[int, int]:
    """Hold qty seats for customer. Returns (order_id, amount_cents)."""
    if not 1 <= qty <= MAX_PER_ORDER:
        raise ValueError(f"qty must be between 1 and {MAX_PER_ORDER}")
    event = db.get_event(conn, event_id)
    if not event["sales_open"]:
        raise SalesClosed(event_id)

    with _hold_lock:
        taken = seats_taken(conn, event_id)
        left = event["capacity"] - taken
        log.info("event=%s seats_left=%s want=%s worker=%s", event_id, left, qty, worker)
        if left < qty:
            raise SoldOut(event_id)
        # Only price purchases that can succeed: the pricing service is slow,
        # and sold-out events get hammered with requests.
        amount = pricing.quote(event, qty, taken)
        cur = conn.execute(
            "INSERT INTO orders (event_id, customer, qty, amount_cents, status, worker, created_ms) "
            "VALUES (?, ?, ?, ?, 'held', ?, ?)",
            (event_id, customer, qty, amount, worker, db.now_ms()),
        )
    return cur.lastrowid, amount


def confirm(conn, order_id: int, payment_ref: str) -> None:
    cur = conn.execute(
        "UPDATE orders SET status = 'confirmed', payment_ref = ? WHERE id = ? AND status = 'held'",
        (payment_ref, order_id),
    )
    if cur.rowcount != 1:
        raise RuntimeError(f"order {order_id} is no longer held")


def release(conn, order_id: int) -> None:
    conn.execute("UPDATE orders SET status = 'voided' WHERE id = ? AND status = 'held'", (order_id,))
