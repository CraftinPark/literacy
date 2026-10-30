"""Muon rate through the telescope from one run of the CB-2 board.

The board counts singles on A and B and AB coincidences (A and B output pulses overlapping). Some coincidences
are accidental: two unrelated pulses that happen to overlap. Their rate is rA * rB * (wA + wB), where wB is
channel B's effective width: it stays near 44.8 ns whatever width_b_ns is set to (measured on the bench at 12 C).
Channel B is also dead for about 1.45 us after each pulse, so it misses a fraction rB * tau of the muons; that
fraction follows B's noise rate, which roughly doubles every 12 C.
"""


def muon_rate(counts, config):
    """counts: {"A", "B", "AB", "seconds", ...} from the board; config: board/config.json. Returns muons/s."""
    t = counts["seconds"]
    ra, rb, rab = counts["A"] / t, counts["B"] / t, counts["AB"] / t
    window = (config["width_a_ns"] + config["b_width_ns"]) * 1e-9
    live_b = 1 - rb * config["b_dead_time_ns"] * 1e-9
    return (rab - ra * rb * window) / live_b
