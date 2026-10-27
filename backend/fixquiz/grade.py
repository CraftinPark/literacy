"""Score a fix-and-quiz attempt.

Section 1 (fix): every test in key.json, visible and hidden, is run against
the candidate's code. A failing-role test earns its points when it passes. A
regression-role test (one that already passes on the shipped code) earns its
points only once at least one failing test of the same ticket passes, so
leaving the code untouched scores 0.

Section 2 (quiz): one answer per question, compared with the key. No penalty
for a wrong answer.
"""
import difflib
import json
from pathlib import Path

from .runner import run_tests, tree_files


def load(example):
    example = Path(example)
    pub = json.loads((example / "public.json").read_text(encoding="utf-8"))
    key = json.loads((example / "key.json").read_text(encoding="utf-8"))
    if pub.get("format") != "fix_quiz":
        raise ValueError(f"{example.name} is not a fix_quiz exercise")
    return pub, key


def hidden_dir(example, key):
    return Path(example, key["hidden_tests_dir"])


def score_fix(key, results):
    rows = [dict(t, passed=results[t["nodeid"]]["passed"], message=results[t["nodeid"]]["message"]) for t in key["tests"]]
    fixed = {r["ticket"] for r in rows if r["role"] == "failing" and r["passed"]}
    for r in rows:
        counts = r["passed"] and (r["role"] == "failing" or r["ticket"] in fixed)
        r["earned"] = r["points"] if counts else 0
        r["note"] = "" if counts or not r["passed"] else "passes, but counts only once a failing test of this ticket passes"
    return rows


def score_quiz(pub, key, answers):
    by_id = {k["question_id"]: k for k in key["quiz"]}
    rows = []
    for q in pub["quiz"]["questions"]:
        k = by_id[q["id"]]
        options = {o["id"] for o in q["options"]}
        picked = answers.get(q["id"]) if answers.get(q["id"]) in options else None
        correct = picked == k["answer"]
        rows.append({
            "id": q["id"], "text": q["text"], "options": q["options"],
            "picked": picked, "answer": k["answer"], "correct": correct,
            "points": k["points"], "earned": k["points"] if correct else 0,
            "explanations": k.get("explanations", {}),
        })
    return rows


def grade(example, tree, answers):
    """Run every test against `tree` and score both sections. Returns a plain dict."""
    pub, key = load(example)
    results = run_tests(example, tree, [t["nodeid"] for t in key["tests"]], hidden_dir(example, key))
    tests = score_fix(key, results)
    quiz = score_quiz(pub, key, answers or {})
    fix_score, quiz_score = sum(r["earned"] for r in tests), sum(r["earned"] for r in quiz)
    sections = key["scoring"]["sections"]
    return {
        "id": pub["id"], "version": pub["version"],
        "score": {
            "total": fix_score + quiz_score, "max": key["scoring"]["total"],
            "fix": fix_score, "fix_max": sections["fix"],
            "quiz": quiz_score, "quiz_max": sections["quiz"],
            "tests_passed": sum(r["passed"] for r in tests), "tests_total": len(tests),
            "quiz_correct": sum(r["correct"] for r in quiz), "quiz_total": len(quiz),
        },
        "tests": tests,
        "quiz": quiz,
    }


def _read(path):
    try:
        return Path(path).read_text(encoding="utf-8").splitlines(keepends=True)
    except (UnicodeDecodeError, OSError):
        return None


def code_diff(example, tree):
    """What the candidate changed, compared with the shipped code: [{path, status, diff}]."""
    shipped = Path(example, "code")
    before, after = set(tree_files(shipped)), set(tree_files(tree))
    out = []
    for rel in sorted(before | after):
        old = _read(shipped / rel) if rel in before else []
        new = _read(Path(tree, rel)) if rel in after else []
        if old == new:
            continue
        status = "added" if rel not in before else "deleted" if rel not in after else "modified"
        if old is None or new is None:
            text = "(binary file)\n"
        else:
            text = "".join(difflib.unified_diff(old, new, f"shipped/{rel}", f"submitted/{rel}"))
        out.append({"path": rel, "status": status, "diff": text})
    return out
