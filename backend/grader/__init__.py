"""ReadCode grader.

    from grader import grade, FakeJudge
    report = grade("examples/readcode-001", submission_dict, FakeJudge())

Three layers: matcher (where), judge (how well, 0..1 per item), score (points).
Plain Python, no web framework, so the API and the pipeline tools can both use it.
"""
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from . import matcher, score as scoring
from .judge import FakeJudge, JudgeError, build_request, check_response

SCHEMAS = Path(__file__).resolve().parents[2] / "schemas"

__all__ = ["grade", "FakeJudge", "JudgeError", "SubmissionError", "validate_submission"]


class SubmissionError(Exception):
    pass


def _validator(name):
    schema = json.loads((SCHEMAS / f"{name}.schema.json").read_text())
    return Draft202012Validator(schema, format_checker=FormatChecker())


_submission_v = _validator("submission")
_report_v = _validator("grading-report")


def validate_submission(public, submission):
    errs = [f"[{'/'.join(map(str, e.path)) or '(root)'}] {e.message}" for e in _submission_v.iter_errors(submission)]
    if errs:
        raise SubmissionError("; ".join(errs[:5]))
    if submission["exercise_id"] != public["id"]:
        raise SubmissionError(f"submission is for {submission['exercise_id']}, not {public['id']}")
    if submission["exercise_version"] != public["version"]:
        raise SubmissionError(f"submission is for version {submission['exercise_version']}, exercise is {public['version']}")
    files = {f["path"]: f["line_count"] for f in public["files"]}
    q_ids = {q["id"] for q in public["questions"]}
    d_ids = {d["id"] for d in public["design_prompts"]}
    if set(submission["comprehension"]) - q_ids:
        raise SubmissionError(f"unknown question ids: {sorted(set(submission['comprehension']) - q_ids)}")
    if set(submission["design"]) - d_ids:
        raise SubmissionError(f"unknown design prompt ids: {sorted(set(submission['design']) - d_ids)}")
    ids = [c["id"] for c in submission["bugs"]]
    if len(ids) != len(set(ids)):
        raise SubmissionError("bug comment ids are not unique")
    for c in submission["bugs"]:
        for r in c["locations"]:
            if r["file"] not in files or not 1 <= r["start_line"] <= r["end_line"] <= files[r["file"]]:
                raise SubmissionError(f"comment {c['id']}: lines {r['start_line']}-{r['end_line']} not in {r['file']}")


def load_example(example_dir):
    ex = Path(example_dir)
    return json.loads((ex / "public.json").read_text()), json.loads((ex / "key.json").read_text())


def grade(example_dir, submission, judge):
    """Grade one submission. Raises SubmissionError or JudgeError; never returns a partial report."""
    public, key = load_example(example_dir)
    validate_submission(public, submission)
    cands = matcher.all_candidates(submission["bugs"], key["bugs"])
    request = build_request(public, key, submission, cands)
    resp = check_response(request, judge.judge(request))
    judged = {(p["comment_id"], p["bug_id"]): p for p in resp["bug_pairs"]}
    claims = {cid for cid, rh in resp["red_herrings"].items() if rh is not None}
    assigned = matcher.assign(cands, judged, claims)
    report = {
        "schema_version": 1, "exercise_id": public["id"], "exercise_version": public["version"],
        "candidate_id": submission["candidate_id"], "judge": judge.name,
        **scoring.score(key, submission, assigned, resp),
        "coaching_tip": resp["coaching_tip"],
    }
    errs = [e.message for e in _report_v.iter_errors(report)]
    if errs:
        raise AssertionError("grader produced an invalid report: " + "; ".join(errs[:5]))
    return report
