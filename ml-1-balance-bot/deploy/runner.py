"""The on-robot control loop: state estimation, policy, action post-processing.

The robot calls `Runner.step` once per control tick with the raw sensor readings and the time since the last
tick, and sends the returned torque (N m) to the wheel motor. The training sim calls it the same way, so what
runs in `sim_eval.py` is exactly what runs on the robot.

Arrays are batched: the sim and the robot's test harness run several episodes side by side, and `idx` says
which episodes have a tick now.
"""
import numpy as np

from policy.net import load_policy

WHEEL_R = 0.035      # m
CPR = 512            # encoder counts per wheel revolution (128-line encoder, x4)
TAU_MAX = 0.40       # N m, motor driver limit; the policy's action is in [-1, 1] of this


class Runner:
    def __init__(self, cfg, n):
        self.tilt_tau = float(cfg["tilt_filter_tau_s"])
        self.ema = float(cfg["action_smoothing"])
        self.policy = load_policy()
        self.n = n
        self.pitch = np.zeros(n)          # complementary-filter tilt estimate, rad
        self.pos = np.zeros(n)            # wheel travel, m
        self.prev_pos = np.full(n, np.nan)
        self.act = np.zeros(n)            # last (smoothed) action, [-1, 1]
        self.started = np.zeros(n, bool)

    def step(self, idx, gyro, acc_x, acc_z, ticks, dt):
        # tilt: gyro integrated, pulled toward the accelerometer's gravity direction with time constant tilt_tau
        acc_pitch = np.arctan2(acc_x, acc_z)
        p = self.pitch[idx]
        new = ~self.started[idx]
        k = self.tilt_tau / (self.tilt_tau + dt)
        p = np.where(new, acc_pitch, k * (p + gyro * dt) + (1 - k) * acc_pitch)
        self.pitch[idx] = p
        # wheel travel and speed from the encoder
        pos = ticks * (2 * np.pi * WHEEL_R / CPR)
        prev = self.prev_pos[idx]
        vel = np.where(new | np.isnan(prev), 0.0, (pos - prev) / np.maximum(dt, 1e-4))
        self.prev_pos[idx] = pos
        self.pos[idx] = pos
        self.started[idx] = True
        obs = np.stack([p, gyro, pos, vel], axis=1)
        a = self.policy(obs)
        # action smoothing (exponential moving average)
        a = np.where(new, a, self.ema * self.act[idx] + (1 - self.ema) * a)
        self.act[idx] = a
        return np.clip(a, -1, 1) * TAU_MAX
