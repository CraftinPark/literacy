"""Runs the deploy stack (deploy/runner.py with deploy/config.json) in the training sim. Free: run it as often
as you like.

    python sim_eval.py                  # 100 episodes
    python sim_eval.py --episodes 300 --seed 7
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from deploy.runner import Runner  # noqa: E402
from training_sim import balancebot  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--episodes", type=int, default=100)
ap.add_argument("--seed", type=int, default=0)
a = ap.parse_args()
cfg = json.load(open(os.path.join(HERE, "deploy", "config.json")))
r = balancebot.run(Runner, a.episodes, a.seed, cfg)
o = r["outcome"]
print(f"config {cfg}")
print(f"sim: {(o == 0).sum()}/{a.episodes} ok, {(o == 1).sum()} fell, {(o == 2).sum()} left the mat")
