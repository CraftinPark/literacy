"""Muon rate through the telescope from one run of the CB-2 board.

The board counts singles on A and B and AB coincidences (A and B output pulses overlapping). Some coincidences
are accidental: two unrelated pulses that happen to overlap. Their rate is rA * rB * (wA + wB).
"""


def muon_rate(counts, config):
    """counts: {"A", "B", "AB", "seconds", ...} from the board; config: board/config.json. Returns muons/s."""
    t = counts["seconds"]
    ra, rb, rab = counts["A"] / t, counts["B"] / t, counts["AB"] / t
    window = (config["width_a_ns"] + config["width_b_ns"]) * 1e-9
    return rab - ra * rb * window
