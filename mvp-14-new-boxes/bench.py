"""Runs the ingest worker pool, with the settings in config.json, on the staging cluster (same hardware as
production: 32 cores) under a replay of production traffic for 10 minutes, and prints what it measured.
Staging is shared: you get 12 runs in total. Measurements are noisy, like any real benchmark.

    python bench.py              # today's peak load, 12,000 events/s
    python bench.py --load 13000
"""
import argparse
import importlib.machinery
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--load", type=int, default=12000)
args = ap.parse_args()
loader = importlib.machinery.SourcelessFileLoader("stage", os.path.join(HERE, "engine", "stage.pyc"))
spec = importlib.util.spec_from_loader("stage", loader)
stage = importlib.util.module_from_spec(spec)
loader.exec_module(stage)
print(stage.run(HERE, args.load))
