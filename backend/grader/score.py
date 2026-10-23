"""Layer 3: turn per-item judgments into points, using only the key's weights. No LLM."""

# CLAUDE.md section 5: bug credit split 40% locate / 40% mechanism / 20% fix.
SPLIT = {"locate": 0.4, "mechanism": 0.4, "fix": 0.2}
RED_HERRING_PENALTY = 2.0
CONFIDENT = {"fairly_sure", "certain"}
BONUS_PER_ITEM = 1.0


def _r(x):
    return round(x, 2)


def score(key, submission, assigned, resp):
    """Compute section scores, penalties and bonus.

    assigned: output of matcher.assign()
    resp:     a checked judge response
    """
    sec = key["scoring"]["sections"]
    bugs = {b["id"]: b for b in key["bugs"]}

    # Blank answers score 0 whatever the judge says: a judge must not be able to invent credit.
    def answered(section, item_id):
        return bool(submission[section].get(item_id, "").strip())

    comp = sum(c["weight"] * resp["comprehension"][c["question_id"]]
               for c in key["comprehension"] if answered("comprehension", c["question_id"]))
    design = sum(d["weight"] * resp["design"][d["prompt_id"]]
                 for d in key["design"] if answered("design", d["prompt_id"]))
    impr = (sum(t["weight"] * s for t, s in zip(key["improvements"]["expected_themes"], resp["improvements"]))
            if submission["improvements"] else 0.0)

    found = []
    for a in assigned:
        b = bugs[a["bug_id"]]
        frac = sum(SPLIT[k] * a[k] for k in SPLIT)
        found.append({"bug_id": b["id"], "title": b["title"], "comment_id": a["comment_id"],
                      "locate": a["locate"], "mechanism": a["mechanism"], "fix": a["fix"],
                      "points": _r(b["weight"] * frac), "max_points": b["weight"]})
    found.sort(key=lambda f: int(f["bug_id"][1:]))
    found_ids = {f["bug_id"] for f in found}
    missed = [{"bug_id": b["id"], "title": b["title"]} for b in key["bugs"] if b["id"] not in found_ids]
    bug_pts = sum(f["points"] for f in found)

    # Comments that matched no key bug: red herring (penalized if confident), bonus, or unlisted.
    matched_c = {a["comment_id"] for a in assigned}
    herrings = [h["description"] for h in key["red_herrings"]]
    bonus_items = key.get("bonus", {}).get("items", [])
    false_pos, unlisted, bonus_hit = [], [], set()
    for c in submission["bugs"]:
        if c["id"] in matched_c:
            continue
        rh = resp["red_herrings"].get(c["id"])
        bi = resp["bonus"].get(c["id"])
        if rh is not None:
            pen = RED_HERRING_PENALTY if c["confidence"] in CONFIDENT else 0.0
            false_pos.append({"comment_id": c["id"], "red_herring": herrings[rh],
                              "confidence": c["confidence"], "penalty": pen})
        elif bi is not None:
            bonus_hit.add(bi)
        else:
            unlisted.append(c["id"])
    penalties = sum(f["penalty"] for f in false_pos)
    bonus = min(len(bonus_hit) * BONUS_PER_ITEM, key.get("bonus", {}).get("max_points", 0))

    sections = {
        "comprehension": {"score": _r(comp), "max": sec["comprehension"]},
        "bugs": {"score": _r(bug_pts), "max": sec["bugs"]},
        "design": {"score": _r(design), "max": sec["design"]},
        "improvements": {"score": _r(impr), "max": sec["improvements"]},
    }
    total = max(0.0, sum(s["score"] for s in sections.values()) - penalties + bonus)
    return {
        "total": _r(total), "max_total": key["scoring"]["total"], "sections": sections,
        "bugs_found": found, "bugs_missed": missed, "false_positives": false_pos,
        "unlisted_findings": unlisted, "penalties": penalties, "bonus": bonus,
    }
