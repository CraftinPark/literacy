"""One manual run on the telescope, with board settings overridden for this run only. Telescope time is
taken from the campaign: budget 10 hours per attempt.

    python bench.py --minutes 10 [--angle 0] [--delay-a NS] [--delay-b NS] [--width-a NS] [--width-b NS] [--source-b]

Prints the board's counts (singles A, singles B, AB coincidences) and the hut temperature. --source-b puts the
Sr-90 check source on paddle B (used for plateau and threshold checks). Board settings are 0..255 ns.
"""
import argparse
import json
import os

from _sim import telescope

BUDGET_H = 10.0
HERE = os.path.dirname(os.path.abspath(__file__))
USED = os.path.join(HERE, ".hours_used")

ap = argparse.ArgumentParser()
ap.add_argument("--minutes", type=float, required=True)
ap.add_argument("--angle", type=int, default=0, choices=[0, 15, 30, 45, 60, 75, 90])
for k in ("delay-a", "delay-b", "width-a", "width-b"):
    ap.add_argument(f"--{k}", type=int)
ap.add_argument("--source-b", action="store_true")
a = ap.parse_args()
used = float(open(USED).read()) if os.path.exists(USED) else 0.0
if used + a.minutes / 60 > BUDGET_H + 1e-9:
    raise SystemExit(f"not enough telescope time left ({BUDGET_H - used:.2f} h of {BUDGET_H} h).")
config = json.load(open(os.path.join(HERE, "board", "config.json")))
for k in ("delay_a", "delay_b", "width_a", "width_b"):
    if getattr(a, k) is not None:
        config[k + "_ns"] = getattr(a, k)
c = telescope.run(config, a.angle, a.minutes * 60, source_b=a.source_b, seed=f"bench-{used:.4f}-{a}")
open(USED, "w").write(f"{used + a.minutes / 60:.4f}")
print(f"settings {config}  angle {a.angle} deg  source_b {a.source_b}")
print(f"{a.minutes:g} min: A = {c['A']}  B = {c['B']}  AB = {c['AB']}   hut {c['hut_c']} C")
print(f"telescope time used: {used + a.minutes / 60:.2f} of {BUDGET_H} h")
