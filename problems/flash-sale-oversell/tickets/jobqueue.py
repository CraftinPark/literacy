"""A job queue in a database table.

The API enqueues one job per purchase request and answers 202 right away; the
purchase workers claim jobs one at a time. claim() is a single UPDATE, so two
workers can never claim the same job.
"""
import json

from . import db


def enqueue(conn, kind: str, payload: dict) -> int:
    cur = conn.execute("INSERT INTO jobs (kind, payload, created_ms) VALUES (?, ?, ?)",
                       (kind, json.dumps(payload), db.now_ms()))
    return cur.lastrowid


def claim(conn, worker: str):
    """Claim the oldest queued job for this worker, or return None if there is none."""
    return conn.execute(
        "UPDATE jobs SET status = 'claimed', claimed_by = ?, attempts = attempts + 1 "
        "WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1) "
        "RETURNING id, kind, payload, attempts",
        (worker,),
    ).fetchone()


def finish(conn, job_id: int, status: str, result: dict) -> None:
    conn.execute("UPDATE jobs SET status = ?, result = ? WHERE id = ?", (status, json.dumps(result), job_id))


def counts(conn) -> dict:
    return {r["status"]: r["n"] for r in conn.execute("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status")}
