"""Layer 1: deterministic bug-location matching (no LLM).

For every bug comment, list the key bugs it could be about. Which one it is
actually about is decided later, using the judge's mechanism scores.
"""

# key.grader_instructions: "Credit bugs by function name or approximate line (+/- 5 lines)."
LINE_TOLERANCE = 5
# A comment that only shares the function with a bug (lines too far away) gets
# partial locate credit, and only counts if the judge says the mechanism matches.
FUNCTION_ONLY_LOCATE = 0.5


def _near(a, b, tol=LINE_TOLERANCE):
    """True if ranges a and b are in the same file and within tol lines of each other."""
    return (a["file"] == b["file"]
            and a["start_line"] <= b["end_line"] + tol
            and b["start_line"] <= a["end_line"] + tol)


def candidates(comment, key_bugs):
    """Return [(bug_id, locate)] for the key bugs this comment's location points at."""
    out = []
    for bug in key_bugs:
        if any(_near(c, k) for c in comment["locations"] for k in bug["locations"]):
            out.append((bug["id"], 1.0))
        elif comment.get("function") and any(k.get("function") == comment["function"] for k in bug["locations"]):
            out.append((bug["id"], FUNCTION_ONLY_LOCATE))
    return out


def all_candidates(comments, key_bugs):
    """{comment_id: [(bug_id, locate)]} for every bug comment in a submission."""
    return {c["id"]: candidates(c, key_bugs) for c in comments}


def assign(cands, judged, red_herring_claims=()):
    """Pick at most one key bug per comment and at most one comment per key bug.

    cands:  {comment_id: [(bug_id, locate)]}
    judged: {(comment_id, bug_id): {"mechanism": 0..1, "fix": 0..1}}
    red_herring_claims: comment ids the judge says claim a red herring is a bug.
        They are never matched to a key bug, even if they sit near one, so a
        wrong claim can't earn locate credit and still gets its penalty.

    Pairs are taken best-first by (mechanism, locate, fix), so a comment that
    explains bug X correctly is matched to X even if it also sits near bug Y.
    Function-only pairs need a mechanism score above zero to count.
    """
    pairs = []
    for cid, lst in cands.items():
        if cid in red_herring_claims:
            continue
        for bid, locate in lst:
            j = judged.get((cid, bid), {"mechanism": 0.0, "fix": 0.0})
            if locate < 1.0 and j["mechanism"] <= 0:
                continue
            pairs.append((j["mechanism"], locate, j["fix"], cid, bid))
    pairs.sort(key=lambda p: (-p[0], -p[1], -p[2], p[3], p[4]))
    used_c, used_b, out = set(), set(), []
    for mech, locate, fix, cid, bid in pairs:
        if cid in used_c or bid in used_b:
            continue
        used_c.add(cid)
        used_b.add(bid)
        out.append({"comment_id": cid, "bug_id": bid, "locate": locate, "mechanism": mech, "fix": fix})
    return out
