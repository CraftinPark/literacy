"""Database access for the ticketing service.

Production runs the same SQL on Postgres. Locally (and in simulate.py) it is a
single SQLite file in WAL mode, so several worker processes can share it.
"""
import sqlite3
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    venue       TEXT    NOT NULL,
    capacity    INTEGER NOT NULL CHECK (capacity >= 0),
    base_cents  INTEGER NOT NULL,
    sales_open  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY,
    event_id     INTEGER NOT NULL REFERENCES events(id),
    customer     TEXT    NOT NULL,
    qty          INTEGER NOT NULL CHECK (qty > 0),
    amount_cents INTEGER NOT NULL,
    status       TEXT    NOT NULL,      -- held | confirmed | voided
    payment_ref  TEXT,
    worker       TEXT    NOT NULL,
    created_ms   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_by_event ON orders(event_id, status);

CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY,
    kind        TEXT    NOT NULL,       -- purchase
    payload     TEXT    NOT NULL,       -- JSON
    status      TEXT    NOT NULL DEFAULT 'queued',   -- queued | claimed | done | failed
    claimed_by  TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    result      TEXT,
    created_ms  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_by_status ON jobs(status, id);
"""


def now_ms() -> int:
    return int(time.time() * 1000)


def connect(path: str) -> sqlite3.Connection:
    # isolation_level=None: autocommit, every statement is its own transaction
    # unless we BEGIN one explicitly.
    conn = sqlite3.connect(path, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init(path: str) -> None:
    conn = connect(path)
    conn.executescript(SCHEMA)
    conn.close()


def create_event(conn, name: str, venue: str, capacity: int, base_cents: int) -> int:
    cur = conn.execute("INSERT INTO events (name, venue, capacity, base_cents) VALUES (?, ?, ?, ?)",
                       (name, venue, capacity, base_cents))
    return cur.lastrowid


def get_event(conn, event_id: int):
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise KeyError(f"no event {event_id}")
    return row
