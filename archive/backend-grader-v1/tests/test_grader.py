"""Grader tests. Rule tests use ScriptedJudge (exact answers) so they test the
scoring rules, not the FakeJudge heuristic."""
import copy
import json
from pathlib import Path

import pytest

from grader import FakeJudge, JudgeError, SubmissionError, grade, matcher
from grader.judge import build_request

ROOT = Path(__file__).resolve().parents[2]
EX = ROOT / "examples" / "readcode-001"
FIX = Path(__file__).parent / "fixtures"
KEY = json.loads((EX / "key.json").read_text())
HERRING_BUCKETS = next(i for i, h in enumerate(KEY["red_herrings"]) if "nbuckets" in h["description"])


def fixture(name):
    return json.loads((FIX / f"readcode-001-{name}.json").read_text())


def empty_submission(**kw):
    s = {"schema_version": 1, "exercise_id": "readcode-001", "exercise_version": 1, "candidate_id": "t",
         "time_spent_minutes": 10, "comprehension": {}, "bugs": [], "design": {}, "improvements": []}
    s.update(kw)
    return s


def comment(cid, start, end=None, confidence="certain", function=None):
    c = {"id": cid, "locations": [{"file": "lru_cache.c", "start_line": start, "end_line": end or start}],
         "severity": "high", "confidence": confidence, "explanation": "x"}
    if function:
        c["function"] = function
    return c


class ScriptedJudge:
    """Returns fixed scores: everything `default` unless overridden."""
    name = "scripted"

    def __init__(self, default=0.0, pairs=None, red_herrings=None, bonus=None, improvements=None, mutate=None):
        self.default, self.pairs = default, pairs or {}
        self.rh, self.bonus, self.impr, self.mutate = red_herrings or {}, bonus or {}, improvements, mutate

    def judge(self, req):
        d = self.default
        resp = {
            "comprehension": {c["question_id"]: d for c in req["comprehension"]},
            "bug_pairs": [{"comment_id": p["comment_id"], "bug_id": p["bug_id"],
                           "mechanism": self.pairs.get((p["comment_id"], p["bug_id"]), (d, d))[0],
                           "fix": self.pairs.get((p["comment_id"], p["bug_id"]), (d, d))[1]}
                          for p in req["bug_pairs"]],
            "red_herrings": {c["comment_id"]: self.rh.get(c["comment_id"]) for c in req["bug_comments"]},
            "bonus": {c["comment_id"]: self.bonus.get(c["comment_id"]) for c in req["bug_comments"]},
            "design": {x["prompt_id"]: d for x in req["design"]},
            "improvements": self.impr if self.impr is not None else [d] * len(req["improvements"]["expected_themes"]),
            "coaching_tip": "tip",
        }
        if self.mutate:
            self.mutate(resp)
        return resp


# ---------------------------------------------------------------- end to end

def test_fixtures_grade_and_separate():
    strong = grade(EX, fixture("strong"), FakeJudge())
    weak = grade(EX, fixture("weak"), FakeJudge())
    assert strong["total"] > weak["total"] + 30
    assert {"B1", "B2"} <= {f["bug_id"] for f in strong["bugs_found"]}


def test_perfect_answers_score_100():
    bugs = [comment(f"c{b['id']}", b["locations"][0]["start_line"]) for b in KEY["bugs"]]
    sub = empty_submission(bugs=bugs, comprehension={c["question_id"]: "a" for c in KEY["comprehension"]},
                           design={d["prompt_id"]: "a" for d in KEY["design"]}, improvements=[{"title": "a"}])
    r = grade(EX, sub, ScriptedJudge(default=1.0))
    assert r["total"] == 100
    assert r["bugs_missed"] == []


def test_nothing_answered_scores_0_even_if_the_judge_says_otherwise():
    r = grade(EX, empty_submission(), ScriptedJudge(default=1.0))
    assert r["total"] == 0
    assert len(r["bugs_missed"]) == len(KEY["bugs"])


# ---------------------------------------------------------------- bug matching

def test_locate_tolerance_is_five_lines():
    # B1 is at lines 198-202
    near, far = comment("near", 207), comment("far", 208)
    assert ("B1", 1.0) in matcher.candidates(near, KEY["bugs"])
    assert "B1" not in [b for b, _ in matcher.candidates(far, KEY["bugs"])]


def test_location_alone_earns_locate_credit_only():
    r = grade(EX, empty_submission(bugs=[comment("c1", 198, 202)]), ScriptedJudge(default=0.0))
    (f,) = r["bugs_found"]
    assert f["bug_id"] == "B1" and f["points"] == pytest.approx(0.4 * 6)


def test_function_only_match_needs_a_mechanism():
    c = comment("c1", 257, function="lru_put")       # >5 lines from every bug, but B4/B5/B10 are in lru_put
    assert grade(EX, empty_submission(bugs=[c]), ScriptedJudge(default=0.0))["bugs_found"] == []
    r = grade(EX, empty_submission(bugs=[c]), ScriptedJudge(pairs={("c1", "B5"): (1.0, 0.0)}))
    (f,) = r["bugs_found"]
    assert f["bug_id"] == "B5" and f["locate"] == 0.5


def test_ambiguous_location_goes_to_the_bug_the_explanation_matches():
    # line 282 is inside B5 (282-290) and within 5 lines of B10 (279)
    c = comment("c1", 282)
    r = grade(EX, empty_submission(bugs=[c]), ScriptedJudge(pairs={("c1", "B10"): (1.0, 1.0)}))
    assert [f["bug_id"] for f in r["bugs_found"]] == ["B10"]


def test_one_comment_per_bug():
    bugs = [comment("a", 198), comment("b", 200)]
    r = grade(EX, empty_submission(bugs=bugs), ScriptedJudge(default=1.0))
    assert len([f for f in r["bugs_found"] if f["bug_id"] == "B1"]) == 1


# ---------------------------------------------------------------- penalties and bonus

@pytest.mark.parametrize("confidence,penalty", [("certain", 2.0), ("fairly_sure", 2.0), ("guess", 0.0)])
def test_red_herring_penalty_depends_on_confidence(confidence, penalty):
    c = comment("c1", 221, confidence=confidence)    # near B6, but claims the bucket-count red herring
    r = grade(EX, empty_submission(bugs=[c]), ScriptedJudge(red_herrings={"c1": HERRING_BUCKETS}))
    assert r["penalties"] == penalty
    assert r["bugs_found"] == []                     # no locate credit for B6


def test_unlisted_findings_are_not_penalized():
    r = grade(EX, empty_submission(bugs=[comment("c1", 20)]), ScriptedJudge())
    assert r["unlisted_findings"] == ["c1"] and r["penalties"] == 0


def test_bonus_is_capped():
    bugs = [comment(f"c{i}", 10 + i) for i in range(5)]
    r = grade(EX, empty_submission(bugs=bugs), ScriptedJudge(bonus={f"c{i}": i for i in range(5)}))
    assert r["bonus"] == KEY["bonus"]["max_points"]


def test_total_never_negative():
    bugs = [comment(f"c{i}", 221 + i) for i in range(3)]
    r = grade(EX, empty_submission(bugs=bugs), ScriptedJudge(red_herrings={f"c{i}": HERRING_BUCKETS for i in range(3)}))
    assert r["total"] == 0


# ---------------------------------------------------------------- rejecting bad input

@pytest.mark.parametrize("mutate,msg", [
    (lambda r: r.pop("coaching_tip"), "schema"),
    (lambda r: r["comprehension"].update(C1=1.5), "schema"),
    (lambda r: r["comprehension"].pop("C1"), "missing comprehension"),
    (lambda r: r["bug_pairs"].clear(), "missing bug_pairs"),
    (lambda r: r["red_herrings"].update(c1=999), "don't exist"),
    (lambda r: r["improvements"].pop(), "wrong number"),
])
def test_malformed_judge_output_is_rejected(mutate, msg):
    with pytest.raises(JudgeError, match=msg):
        grade(EX, empty_submission(bugs=[comment("c1", 198)]), ScriptedJudge(mutate=mutate))


@pytest.mark.parametrize("change,msg", [
    (dict(exercise_id="readcode-999"), "not readcode-001"),
    (dict(exercise_version=2), "version"),
    (dict(comprehension={"C9": "x"}), "unknown question"),
    (dict(design={"D9": "x"}), "unknown design"),
    (dict(bugs=[comment("c1", 600)]), "not in lru_cache.c"),
    (dict(bugs=[comment("c1", 1), comment("c1", 2)]), "not unique"),
    (dict(schema_version=2), "schema_version"),
])
def test_bad_submissions_are_rejected(change, msg):
    with pytest.raises(SubmissionError, match=msg):
        grade(EX, empty_submission(**change), ScriptedJudge())


def test_judge_request_carries_no_weights():
    sub = fixture("strong")
    req = build_request(json.loads((EX / "public.json").read_text()), KEY, sub,
                        matcher.all_candidates(sub["bugs"], KEY["bugs"]))
    assert "weight" not in json.dumps(req)


def test_fixtures_do_not_mutate():
    sub = fixture("strong")
    before = copy.deepcopy(sub)
    grade(EX, sub, FakeJudge())
    assert sub == before
