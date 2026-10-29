"""Fits I(theta) = I0 * cos(theta)^n to muon rates per zenith angle (weighted least squares, grid over n)."""
import math


def fit_cos_n(points):
    """points: [(angle_deg, rate, sigma)]. Returns (I0, n)."""
    best = None
    for k in range(0, 4001):
        n = k / 1000
        c = [math.cos(math.radians(a)) ** n for a, _, _ in points]
        w = [1 / s ** 2 for _, _, s in points]
        den = sum(wi * ci * ci for wi, ci in zip(w, c))
        i0 = sum(wi * y * ci for wi, (_, y, _), ci in zip(w, points, c)) / den
        chi = sum(wi * (y - i0 * ci) ** 2 for wi, (_, y, _), ci in zip(w, points, c))
        if best is None or chi < best[0]:
            best = (chi, i0, n)
    return best[1], best[2]


def per_angle(runs, rates):
    """Time-weighted mean rate and its sigma for each angle. runs: board counts, rates: muon_rate per run."""
    acc = {}
    for c, r in zip(runs, rates):
        a = acc.setdefault(c["angle_deg"], [0.0, 0.0, 0.0])
        a[0] += r * c["seconds"]
        a[1] += c["seconds"]
        a[2] += c["AB"]
    return [(ang, s / t, math.sqrt(max(ab, 1)) / t) for ang, (s, t, ab) in sorted(acc.items())]
