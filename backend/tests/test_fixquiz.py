"""Fix-and-quiz grading, sessions and build, against examples/readcode-004.

These run real pytest subprocesses, so each grading call takes about a second.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from fixquiz import build, grade, report, session

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "examples" / "readcode-004"
FIXES = {f["id"]: f for f in json.loads((EXAMPLE / "internal" / "verification" / "fixes.json").read_text())}
ALL_RIGHT = {"Q1": "b", "Q2": "b", "Q3": "a", "Q4": "a", "Q5": "a"}


def shipped_copy(tmp_path, fix_ids=()):
    tree = tmp_path / "tree"
    shutil.copytree(EXAMPLE / "code", tree)
    for fid in fix_ids:
        for e in FIXES[fid]["edits"]:
            build.apply_edit(tree, e, fid)
    return tree


def earned(graded, ticket):
    return sum(t["earned"] for t in graded["tests"] if t["ticket"] == ticket)


def test_untouched_code_scores_zero_in_section_1(tmp_path):
    g = grade.grade(EXAMPLE, shipped_copy(tmp_path), {})
    passing = sorted(t["id"] for t in g["tests"] if t["passed"])
    assert passing == ["T3", "T7"]                 # the two regression tests already pass...
    assert g["score"]["fix"] == 0                   # ...but earn nothing until a bug is fixed
    assert g["score"]["total"] == 0


def test_clean_baseline_and_right_answers_score_100():
    g = grade.grade(EXAMPLE, EXAMPLE / "internal" / "baseline", ALL_RIGHT)
    assert g["score"]["total"] == 100
    assert g["score"]["tests_passed"] == 8 and g["score"]["quiz_correct"] == 5


def test_hidden_tests_separate_a_shallow_fix_from_a_real_one(tmp_path):
    shallow = grade.grade(EXAMPLE, shipped_copy(tmp_path / "a", ["A-webhook-only", "B-count-every-row"]), {})
    real = grade.grade(EXAMPLE, shipped_copy(tmp_path / "b", ["A-in-charge", "B-from-succeeded-rows"]), {})
    assert (earned(shallow, "A"), earned(shallow, "B")) == (25, 25)
    assert (earned(real, "A"), earned(real, "B")) == (35, 35)


def test_edited_tests_in_the_workspace_are_ignored(tmp_path):
    tree = shipped_copy(tmp_path)
    for f in (tree / "tests").glob("test_*.py"):
        f.write_text("def test_anything():\n    assert True\n")
    (tree / "conftest.py").write_text("import pytest\n@pytest.fixture(autouse=True)\ndef _x(): pass\n")
    g = grade.grade(EXAMPLE, tree, {})
    assert g["score"]["fix"] == 0
    assert g["score"]["tests_total"] == 8


def test_code_that_does_not_import_fails_every_test_with_a_reason(tmp_path):
    tree = shipped_copy(tmp_path)
    (tree / "tally" / "refunds.py").write_text("def refund(:\n")
    g = grade.grade(EXAMPLE, tree, {})
    assert not any(t["passed"] for t in g["tests"])
    assert all(t["message"].startswith("did not run") for t in g["tests"])


def test_quiz_ignores_unknown_options_and_questions():
    pub, key = grade.load(EXAMPLE)
    rows = grade.score_quiz(pub, key, {"Q1": "b", "Q2": "z", "Q99": "a"})
    assert [(r["id"], r["picked"], r["earned"]) for r in rows][:2] == [("Q1", "b", 6), ("Q2", None, 0)]
    assert sum(r["earned"] for r in rows) == 6


def edited_files(tmp_path, fix_ids):
    """What the page would send: {path: text} for the files a fix changes."""
    tree = shipped_copy(tmp_path, fix_ids)
    paths = {e["file"] for fid in fix_ids for e in FIXES[fid]["edits"]}
    return {p: (tree / p).read_text(encoding="utf-8") for p in paths}


def test_session_runs_and_grades_the_files_the_page_sends(tmp_path):
    assert (session.run_visible(EXAMPLE, {})["passed"], 6) == (2, 6)
    files = edited_files(tmp_path, ["A-in-charge"])
    run = session.run_visible(EXAMPLE, files)
    assert (run["passed"], run["total"]) == (4, 6)
    assert all("hidden" not in t["nodeid"] for t in run["tests"])

    done = session.complete(EXAMPLE, tmp_path / "work", files, ALL_RIGHT, "Ada <script>",
                            {"fix_started_at": 0, "quiz_started_at": 60_000, "completed_at": 90_000})
    assert done["score"]["fix"] == 35 and done["score"]["quiz"] == 30
    assert Path(done["report_path"]).read_text(encoding="utf-8") == done["html"]
    assert "Ada &lt;script&gt;" in done["html"] and "<script>" not in done["html"]
    assert "tally/payments.py" in done["html"] and "tally/refunds.py" not in done["html"]


@pytest.mark.parametrize("path", ["tests/test_refunds.py", "pytest.ini", "tally/new_module.py", "../escape.py"])
def test_session_refuses_files_it_should_not_take(path):
    with pytest.raises(ValueError):
        session.run_visible(EXAMPLE, {path: "x = 1\n"})


def test_report_renders_without_timings(tmp_path):
    pub, key = grade.load(EXAMPLE)
    g = grade.grade(EXAMPLE, shipped_copy(tmp_path), {})
    html = report.render(pub, key, g, [], "")
    assert html.startswith("<!doctype html>") and "No changes: the code is as shipped." in html
    assert "not answered" in html


def test_cli_api_speaks_json(tmp_path):
    def call(action, body):
        p = subprocess.run([sys.executable, "-m", "fixquiz", "api", action, "--example", str(EXAMPLE), "--workdir", str(tmp_path)],
                           input=json.dumps(body), capture_output=True, text=True, cwd=ROOT / "backend")
        return p.returncode, json.loads(p.stdout)
    code, reply = call("run", {"files": {}})
    assert code == 0 and (reply["passed"], reply["total"]) == (2, 6)
    code, reply = call("run", {"files": {"tests/test_charges.py": ""}})
    assert code == 1 and "can't be changed" in reply["error"]
    code, reply = call("explode", {})
    assert code == 1 and "unknown action" in reply["error"]


def test_rebuilding_reproduces_the_committed_example(tmp_path):
    copy = tmp_path / "readcode-004"
    shutil.copytree(EXAMPLE, copy, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    build.build(copy)
    for name in ("manifest.json", "public.json"):
        assert (copy / name).read_text(encoding="utf-8") == (EXAMPLE / name).read_text(encoding="utf-8"), name
    for ev in (EXAMPLE / "internal" / "evidence").iterdir():
        assert (copy / "internal" / "evidence" / ev.name).read_text(encoding="utf-8") == ev.read_text(encoding="utf-8"), ev.name
