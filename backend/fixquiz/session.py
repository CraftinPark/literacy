"""The steps behind the exercise page, one function per button.

The candidate edits the code in the page's built-in editor; the browser sends
the files it changed with each request. A tree is built in a temporary folder
from the shipped code/ plus those files, and the tests run against it. Only
files listed in public.json can be replaced, and never tests or pytest config
(those always come from the example).

Reports are written to <workdir>/reports/ (literacy/workspace/reports/ by default).
Nothing but public content goes back to the browser until complete(), whose
report includes the answer key.
"""
import tempfile
from datetime import datetime
from pathlib import Path

from . import report
from .grade import code_diff, grade, load
from .runner import copy_tree, is_test_or_config, run_tests

MAX_FILE_CHARS = 200_000


def editable_paths(pub):
    return {f["path"] for f in pub["files"] if not is_test_or_config(f["path"])}


def build_tree(example, pub, files, dest):
    """Shipped code/ in dest, with the candidate's versions of editable files on top."""
    copy_tree(Path(example, "code"), dest)
    allowed = editable_paths(pub)
    for path, text in (files or {}).items():
        if path not in allowed:
            raise ValueError(f"{path} can't be changed in this exercise")
        if not isinstance(text, str) or len(text) > MAX_FILE_CHARS:
            raise ValueError(f"{path} is not text or is too large")
        with open(Path(dest, path), "w", encoding="utf-8", newline="") as f:
            f.write(text)


def run_visible(example, files):
    """Run the provided tests against the candidate's files. Hidden tests are never run here."""
    pub, _ = load(example)
    tests = pub["fix"]["visible_tests"]
    with tempfile.TemporaryDirectory(prefix="fixquiz-tree-") as tree:
        build_tree(example, pub, files, tree)
        results = run_tests(example, tree, [t["nodeid"] for t in tests])
    rows = [{"nodeid": t["nodeid"], "ticket": t["ticket"], **results[t["nodeid"]]} for t in tests]
    return {"tests": rows, "passed": sum(r["passed"] for r in rows), "total": len(rows)}


def complete(example, workdir, files, answers, candidate="", timings=None):
    """Grade the files frozen at Next and the quiz answers; write and return the HTML report."""
    pub, key = load(example)
    with tempfile.TemporaryDirectory(prefix="fixquiz-tree-") as tree:
        build_tree(example, pub, files, tree)
        graded = grade(example, tree, answers)
        diff = code_diff(example, tree)
    now = datetime.now().astimezone()
    html = report.render(pub, key, graded, diff, candidate, timings, now)
    reports = Path(workdir).resolve() / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    path = reports / f"{pub['id']}-{now.strftime('%Y%m%d-%H%M%S')}.html"
    path.write_text(html, encoding="utf-8")
    return {"report_path": str(path), "filename": path.name, "html": html, "score": graded["score"]}
