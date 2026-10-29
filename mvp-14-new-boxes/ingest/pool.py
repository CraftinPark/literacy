"""The ingest worker pool (production entry point). Settings come from config.json:

    workers   - worker processes pulling from the event stream
    batch     - events a worker commits together
    prefetch  - batches each worker keeps fetched ahead, so it never waits on the stream

Each worker: fetch batches ahead (up to `prefetch`), decode, enrich, then commit the batch to the ledger.
The heavy lifting (decode/enrich/commit) is in the compiled `ingestcore` extension, owned by the platform team.
"""
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def settings():
    cfg = json.load(open(os.path.join(HERE, "config.json")))
    workers = cfg.get("workers") or os.cpu_count()
    return int(workers), int(cfg["batch"]), int(cfg["prefetch"])
