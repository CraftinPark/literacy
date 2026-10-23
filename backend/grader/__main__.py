"""Grade a submission from the command line.

    cd backend && python -m grader ../examples/readcode-001 path/to/submission.json
"""
import argparse
import json
import sys

from . import FakeJudge, JudgeError, SubmissionError, grade

JUDGES = {"fake": FakeJudge}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("example", help="example folder, e.g. ../examples/readcode-001")
    ap.add_argument("submission", help="submission JSON file")
    ap.add_argument("--judge", choices=sorted(JUDGES), default="fake")
    ap.add_argument("--json", action="store_true", help="print the full report as JSON")
    a = ap.parse_args()
    with open(a.submission, encoding="utf-8") as f:
        sub = json.load(f)
    try:
        r = grade(a.example, sub, JUDGES[a.judge]())
    except (SubmissionError, JudgeError) as e:
        sys.exit(f"cannot grade: {e}")
    if a.json:
        print(json.dumps(r, indent=2))
        return
    print(f"{r['exercise_id']}  candidate={r['candidate_id']}  judge={r['judge']}")
    print(f"TOTAL {r['total']} / {r['max_total']}   (penalties -{r['penalties']}, bonus +{r['bonus']})")
    for name, s in r["sections"].items():
        print(f"  {name:<14} {s['score']:>6} / {s['max']}")
    print("found:   " + ", ".join(f"{f['bug_id']}({f['points']}/{f['max_points']})" for f in r["bugs_found"]))
    print("missed:  " + ", ".join(m["bug_id"] for m in r["bugs_missed"]))
    for fp in r["false_positives"]:
        print(f"false positive: {fp['comment_id']} -> {fp['red_herring']!r} (-{fp['penalty']})")
    if r["unlisted_findings"]:
        print("unlisted (for human review): " + ", ".join(r["unlisted_findings"]))
    print("tip: " + r["coaching_tip"])


if __name__ == "__main__":
    main()
