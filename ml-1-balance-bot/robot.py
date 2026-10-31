"""Runs episodes on the real robot with the deploy stack and deploy/config.json, and prints what the robot's
logger records. Robot time is limited: 60 episodes in total for this ticket.

    python robot.py                 # 10 episodes
    python robot.py --episodes 4

Each episode is the same test as in the training sim: 20 s on the mat, started near upright in the centre,
two taps on the body at random times. Telemetry (50 Hz, what the robot itself measured) is saved to
robot_logs/trial_NN/ep_MM.csv: t, pitch_est (rad, the deploy stack's tilt estimate), gyro (rad/s, raw),
wheel_pos (m, from the encoder), torque_cmd (N m, last command received by the motor driver).
"""
import argparse
import json
import os
import secrets
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _sim import robot  # noqa: E402  (the physical robot; see README)
from deploy.runner import Runner  # noqa: E402

BUDGET = 60
USED = os.path.join(HERE, ".robot_episodes_used")

ap = argparse.ArgumentParser()
ap.add_argument("--episodes", type=int, default=10)
a = ap.parse_args()
if not 1 <= a.episodes <= 10:
    raise SystemExit("1 to 10 episodes per trial")
used = int(open(USED).read()) if os.path.exists(USED) else 0
if used + a.episodes > BUDGET:
    raise SystemExit(f"not enough robot time left: {BUDGET - used} of {BUDGET} episodes")
cfg = json.load(open(os.path.join(HERE, "deploy", "config.json")))
if set(cfg) != {"control_hz", "tilt_filter_tau_s", "action_smoothing"} or not (
        isinstance(cfg["control_hz"], int) and 50 <= cfg["control_hz"] <= 1000
        and 0.05 <= cfg["tilt_filter_tau_s"] <= 5 and 0 <= cfg["action_smoothing"] <= 0.95):
    raise SystemExit("deploy/config.json: control_hz int 50-1000, tilt_filter_tau_s 0.05-5, action_smoothing 0-0.95")
open(USED, "w").write(str(used + a.episodes))
trial = len([d for d in os.listdir(os.path.join(HERE, "robot_logs"))]) + 1 if os.path.isdir(
    os.path.join(HERE, "robot_logs")) else 1
r = robot.run(Runner, a.episodes, secrets.randbits(63), cfg, record=True)

out = os.path.join(HERE, "robot_logs", f"trial_{trial:02d}")
os.makedirs(out, exist_ok=True)
json.dump(cfg, open(os.path.join(out, "config.json"), "w"), indent=1)
print(f"trial {trial}: {a.episodes} episodes, config {cfg}")
names = {0: "ok", 1: "fell", 2: "left the mat", 3: "motor driver tripped (over-current), fell"}
for i in range(a.episodes):
    rows = [(t, pe[i], g[i], x[i], u[i]) for (t, pe, g, x, u, alive) in r["tele"] if alive[i]]
    arr = np.array(rows)
    np.savetxt(os.path.join(out, f"ep_{i + 1:02d}.csv"), arr, delimiter=",", fmt="%.5f",
               header="t,pitch_est,gyro,wheel_pos,torque_cmd", comments="")
    o = int(r["outcome"][i])
    when = f" at {r['t_end'][i]:.1f} s" if o else ""
    print(f"  ep {i + 1:2d}: {names[o]:<44}{when:<10} max|wheel_pos| {np.abs(arr[:, 3]).max():.3f} m"
          f"  max|pitch_est| {np.abs(arr[:, 1]).max():.3f} rad  torque rms {np.sqrt((arr[:, 4] ** 2).mean()):.3f} N m")
ok = int((r["outcome"] == 0).sum())
rate = r["ticks"].sum() / max(r["t_end"].sum(), 1e-9)
print(f"  {ok}/{a.episodes} ok.  control loop: {rate:.0f} ticks/s achieved, "
      f"{100 * r['overruns'].sum() / max(r['ticks'].sum(), 1):.1f}% of ticks overran their period")
print(f"robot time used: {used + a.episodes} of {BUDGET} episodes.  telemetry in robot_logs/trial_{trial:02d}/")
