"""Training sim for the balance bot: planar wheeled inverted pendulum (cart-pole model), 2 kHz physics.

The policy was trained here, and `sim_eval.py` runs the deploy stack (`deploy/runner.py`) against it. Sensors
follow the hardware spec sheet: MEMS gyro (noise 0.004 rad/s), accelerometer (noise 0.01 g) mounted 5 cm above
the axle, 512-count wheel encoder. The motor driver tracks the commanded torque with a 2 ms time constant.

Episode: 20 s on the test mat. The robot starts upright-ish (+-0.05 rad) in the centre and gets two taps on
the body at random times. It fails if it tips past 0.5 rad ("fell") or rolls more than 0.5 m from the centre
("left the mat").
"""
import numpy as np

# body
MC, MP, L, IC, G, R, B_X = 0.40, 0.80, 0.08, 0.0025, 9.81, 0.035, 0.05
H_IMU = 0.05
TAU_MAX = 0.40
MOTOR_TC = 0.002
CPR = 512
GYRO_NOISE = 0.004
ACC_NOISE = 0.01
# episode
PHYS_DT = 0.0005
EP_S = 20.0
PITCH_LIMIT = 0.5
MAT = 0.5


def dynamics(x, v, th, w, F, mc=MC, mp=MP, l=L):
    """Cart-pole equations of motion. Returns (wheel acceleration, pitch acceleration)."""
    M = mc + mp
    J = IC + mp * l * l
    c, s = np.cos(th), np.sin(th)
    a11, a12, a22 = M, mp * l * c, J
    b1 = F + mp * l * s * w * w - B_X * v
    b2 = mp * G * l * s
    det = a11 * a22 - a12 * a12
    return (b1 * a22 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det


def run(runner_factory, n, seed, cfg, mass_scale=None):
    """Runs n episodes side by side with the deploy stack in the loop. Returns per-episode outcomes:
    outcome 0 = ok, 1 = fell, 2 = left the mat."""
    rng = np.random.default_rng(seed)
    period = 1.0 / float(cfg["control_hz"])
    runner = runner_factory(cfg, n)
    mp = MP * (mass_scale if mass_scale is not None else rng.uniform(0.9, 1.1, n))
    x = np.zeros(n); v = np.zeros(n); th = rng.uniform(-0.05, 0.05, n); w = np.zeros(n)
    xdd = np.zeros(n); thdd = np.zeros(n); tau = np.zeros(n); u_cmd = np.zeros(n)
    enc_off = rng.uniform(0, 1, n)
    push_t = np.sort(rng.uniform(3, EP_S - 3, (n, 2)), axis=1)
    push_dw = rng.choice([-1, 1], (n, 2)) * rng.uniform(0.3, 0.6, (n, 2))
    pushed = np.zeros((n, 2), bool)
    alive = np.ones(n, bool)
    outcome = np.zeros(n, int)
    t_end = np.full(n, EP_S)
    next_tick = 0.0
    next_push = push_t.min()
    all_idx = np.arange(n)
    for k in range(int(round(EP_S / PHYS_DT))):
        t = k * PHYS_DT
        if t >= next_tick - 1e-12:
            # accelerometer: specific force at the IMU, in the body frame, in g
            c, s = np.cos(th), np.sin(th)
            ax = xdd + H_IMU * (thdd * c - w * w * s)
            az = H_IMU * (-thdd * s - w * w * c) + G
            acc_x = -(ax * c - az * s) / G + rng.normal(0, ACC_NOISE, n)
            acc_z = (ax * s + az * c) / G + rng.normal(0, ACC_NOISE, n)
            gyro = w + rng.normal(0, GYRO_NOISE, n)
            ticks = np.floor(x / (2 * np.pi * R) * CPR + enc_off)
            u_cmd = runner.step(all_idx, gyro, acc_x, acc_z, ticks, np.full(n, period))
            next_tick += period
        tau += (np.clip(u_cmd, -TAU_MAX, TAU_MAX) - tau) * (PHYS_DT / MOTOR_TC)
        if t >= next_push:
            for j in range(2):
                hit = alive & ~pushed[:, j] & (t >= push_t[:, j])
                w = w + np.where(hit, push_dw[:, j], 0)
                pushed[:, j] |= hit
            left_t = np.where(pushed, np.inf, push_t)
            next_push = left_t.min()
        xdd, thdd = dynamics(x, v, th, w, tau / R, mp=mp)
        v = v + xdd * PHYS_DT
        x = x + v * PHYS_DT
        w = w + thdd * PHYS_DT
        th = th + w * PHYS_DT
        if k % 4 == 0:  # safety monitor runs at 500 Hz
            fell = alive & (np.abs(th) > PITCH_LIMIT)
            left = alive & ~fell & (np.abs(x) > MAT)
            outcome[fell] = 1
            outcome[left] = 2
            t_end[fell | left] = t
            alive &= ~(fell | left)
    return dict(outcome=outcome, t_end=t_end)
