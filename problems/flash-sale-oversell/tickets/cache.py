"""A small in-process cache for "seats left", shown on the event page and used
by the workers to drop purchases for events that are clearly sold out without
touching the database.

Values may be up to TTL_SECONDS old. That is fine for the page ("3 left" may be
a few seconds behind), and the worker only uses it to *reject* early: a stale
value can make it try a purchase that the inventory check then refuses.
"""
import threading
import time

TTL_SECONDS = 5.0

_values: dict[int, tuple[float, int]] = {}
_lock = threading.Lock()


def get_seats_left(event_id: int):
    with _lock:
        hit = _values.get(event_id)
    if hit is None:
        return None
    stored_at, value = hit
    if time.monotonic() - stored_at > TTL_SECONDS:
        return None
    return value


def put_seats_left(event_id: int, value: int) -> None:
    with _lock:
        _values[event_id] = (time.monotonic(), value)


def invalidate(event_id: int) -> None:
    with _lock:
        _values.pop(event_id, None)
