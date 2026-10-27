"""Layer 2: the judge. Scores the parts that need judgment, item by item, 0..1.

The judge never adds up points; score.py does that. A judge gets one request
(built by build_request) and must return a dict matching RESPONSE_SCHEMA.
A response that doesn't match is rejected, not half-trusted.

Judges:
  FakeJudge  word-overlap heuristic. Free, offline, deterministic. For tests and demos.
  (future)   an LLM judge: send build_prompt(request), parse JSON, return it.
"""
import json
import re

from jsonschema import Draft202012Validator

_score = {"type": "number", "minimum": 0, "maximum": 1}
_index_or_null = {"type": ["integer", "null"], "minimum": 0}

RESPONSE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["comprehension", "bug_pairs", "red_herrings", "bonus", "design", "improvements", "coaching_tip"],
    "properties": {
        "comprehension": {"type": "object", "additionalProperties": _score},
        "bug_pairs": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["comment_id", "bug_id", "mechanism", "fix"],
                "properties": {"comment_id": {"type": "string"}, "bug_id": {"type": "string"},
                               "mechanism": _score, "fix": _score},
            },
        },
        "red_herrings": {"type": "object", "additionalProperties": _index_or_null},
        "bonus": {"type": "object", "additionalProperties": _index_or_null},
        "design": {"type": "object", "additionalProperties": _score},
        "improvements": {"type": "array", "items": _score},
        "coaching_tip": {"type": "string", "minLength": 1},
    },
}
_validator = Draft202012Validator(RESPONSE_SCHEMA)


class JudgeError(Exception):
    pass


def build_request(public, key, submission, cands):
    """Everything the judge needs, and nothing it doesn't (no weights, no scores)."""
    q_text = {q["id"]: q["text"] for q in public["questions"]}
    d_text = {d["id"]: d["text"] for d in public["design_prompts"]}
    bugs = {b["id"]: b for b in key["bugs"]}
    comments = {c["id"]: c for c in submission["bugs"]}
    return {
        "instructions": key["grader_instructions"],
        "comprehension": [
            {"question_id": c["question_id"], "question": q_text[c["question_id"]],
             "answer": submission["comprehension"].get(c["question_id"], ""), "key_points": c["key_points"]}
            for c in key["comprehension"]],
        "bug_pairs": [
            {"comment_id": cid, "bug_id": bid,
             "comment": {"explanation": comments[cid]["explanation"], "fix": comments[cid].get("fix", "")},
             "bug": {"title": bugs[bid]["title"], "description": bugs[bid]["description"],
                     "mechanism_anchors": bugs[bid]["mechanism_anchors"], "fix": bugs[bid]["fix"]}}
            for cid, lst in cands.items() for bid, _ in lst],
        "bug_comments": [{"comment_id": c["id"], "explanation": c["explanation"]} for c in submission["bugs"]],
        "red_herrings": [h["description"] for h in key["red_herrings"]],
        "bonus_items": key.get("bonus", {}).get("items", []),
        "design": [
            {"prompt_id": d["prompt_id"], "prompt": d_text[d["prompt_id"]],
             "answer": submission["design"].get(d["prompt_id"], ""), "anchors": d["anchors"]}
            for d in key["design"]],
        "design_notes": [n["text"] for n in submission.get("notes", []) if n["type"] == "design"],
        "improvements": {
            "candidate": [f"{i['title']}. {i.get('detail', '')}".strip() for i in submission["improvements"]],
            "expected_themes": [t["theme"] for t in key["improvements"]["expected_themes"]]},
    }


def build_prompt(request):
    """The prompt an LLM judge will receive. Kept here so it is versioned with the response schema."""
    return (
        "You are grading a code-reading exercise. Score each item from 0 to 1 against the rubric given.\n"
        "Rules:\n" + "\n".join(f"- {s}" for s in request["instructions"]) + "\n"
        "- comprehension / design: fraction of key points or anchors the answer covers in meaning (not wording).\n"
        "- bug_pairs: for each (comment, bug) pair, mechanism = does the comment explain this bug's root cause;\n"
        "  fix = would the comment's fix correct it (0 if no fix given).\n"
        "- red_herrings: for each bug comment, the index of the red herring it claims is a bug, or null.\n"
        "- bonus: for each bug comment, the index of the bonus item it identifies, or null.\n"
        "- improvements: one score per expected theme: how well the candidate's improvements cover it.\n"
        "- coaching_tip: one actionable sentence on how the candidate could read code better.\n"
        "Reply with JSON only, matching this schema:\n"
        + json.dumps(RESPONSE_SCHEMA) + "\n\nRUBRIC AND ANSWERS:\n" + json.dumps(request, indent=1)
    )


def check_response(request, resp):
    """Reject malformed or incomplete judge output."""
    errs = [e.message for e in _validator.iter_errors(resp)]
    if errs:
        raise JudgeError("judge response does not match the schema: " + "; ".join(errs[:5]))
    want_pairs = {(p["comment_id"], p["bug_id"]) for p in request["bug_pairs"]}
    got_pairs = {(p["comment_id"], p["bug_id"]) for p in resp["bug_pairs"]}
    missing = {
        "comprehension": {c["question_id"] for c in request["comprehension"]} - set(resp["comprehension"]),
        "design": {d["prompt_id"] for d in request["design"]} - set(resp["design"]),
        "bug_pairs": want_pairs - got_pairs,
    }
    for part, ids in missing.items():
        if ids:
            raise JudgeError(f"judge response is missing {part}: {sorted(ids)}")
    if len(resp["improvements"]) != len(request["improvements"]["expected_themes"]):
        raise JudgeError("judge response has the wrong number of improvement scores")
    for name, n in (("red_herrings", len(request["red_herrings"])), ("bonus", len(request["bonus_items"]))):
        bad = [i for i in resp[name].values() if i is not None and i >= n]
        if bad:
            raise JudgeError(f"judge response points at {name} that don't exist: {bad}")
    return resp


# ---------------------------------------------------------------- FakeJudge

_STOP = set("""a an the and or of to in on for is are be by it its this that with as at from not no
into than then so if can each every when which while all any only use used""".split())


def _words(text):
    return {w for w in re.findall(r"[a-z_][a-z0-9_]+", text.lower()) if w not in _STOP and len(w) > 2}


def _covers(answer, point):
    """Fraction of a key point's words that appear in the answer."""
    pw = _words(point)
    return len(pw & _words(answer)) / len(pw) if pw else 0.0


def _coverage(answer, points, hit=0.5):
    """Fraction of key points the answer covers (a point counts if half its words appear)."""
    if not answer.strip():
        return 0.0
    return sum(_covers(answer, p) >= hit for p in points) / len(points)


def _best(text, options, hit=0.5):
    scored = [(_covers(text, o), i) for i, o in enumerate(options)]
    best = max(scored, default=(0, None))
    return best[1] if best[0] >= hit else None


class FakeJudge:
    """Word-overlap stand-in for an LLM. Crude, but free and repeatable.

    It is NOT a quality judge: paraphrases score low, keyword stuffing scores high.
    Its job is to exercise the whole pipeline until a real model is plugged in.
    """
    name = "fake-keyword"

    def judge(self, request):
        pairs = []
        for p in request["bug_pairs"]:
            anchors = p["bug"]["mechanism_anchors"] + [p["bug"]["title"]]
            mech = max(_covers(p["comment"]["explanation"], a) for a in anchors)
            fix = _covers(p["comment"]["fix"], p["bug"]["fix"]) if p["comment"]["fix"] else 0.0
            pairs.append({"comment_id": p["comment_id"], "bug_id": p["bug_id"],
                          "mechanism": round(min(1.0, mech * 1.5), 2), "fix": round(min(1.0, fix * 2), 2)})
        joined = " ".join(request["improvements"]["candidate"])
        return {
            "comprehension": {c["question_id"]: _coverage(c["answer"], c["key_points"]) for c in request["comprehension"]},
            "bug_pairs": pairs,
            "red_herrings": {c["comment_id"]: _best(c["explanation"], request["red_herrings"]) for c in request["bug_comments"]},
            "bonus": {c["comment_id"]: _best(c["explanation"], request["bonus_items"]) for c in request["bug_comments"]},
            "design": {d["prompt_id"]: _coverage(d["answer"] + " " + " ".join(request["design_notes"]), d["anchors"])
                       for d in request["design"]},
            "improvements": [_coverage(joined, [t], hit=0.4) for t in request["improvements"]["expected_themes"]],
            "coaching_tip": "Before writing a finding, trace one concrete call path through the function and "
                            "name the exact line where state goes wrong.",
        }
