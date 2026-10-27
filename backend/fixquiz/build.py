"""Build a fix_quiz example from its clean baseline and record every check.

    python -m fixquiz build ../examples/readcode-004

1. code/ = internal/baseline/ with internal/verification/mutations.json applied
   (each `old` must occur exactly once in its file; old/new are whole lines).
2. Gate A: the baseline passes every test in key.json, hidden ones included.
3. Gate B, per ticket: its failing-role tests fail on the shipped code and its
   regression tests still pass.
4. Fix checks (internal/verification/fixes.json), each applied to the shipped
   code: a correct fix passes all of its ticket's tests; a wrong fix passes the
   ticket's visible tests but fails at least one hidden test.
5. Evidence files, public.json `files`, and manifest.json (hashes, bug lines,
   results). The manifest's review block is reset to pending if anything changed.

Rerun after any change to the baseline, mutations, fixes, or tests.
"""
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from .grade import hidden_dir, load
from .runner import copy_tree, run_tests, sha256_file, tree_files, tree_sha256


def read(p):
    with open(p, encoding="utf-8", newline="") as f:
        return f.read()


def write(p, text):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def apply_edit(root, edit, label):
    p = Path(root, edit["file"])
    text = read(p)
    for s in (edit["old"], edit["new"]):
        if not s.endswith("\n"):
            raise SystemExit(f"{label}: old/new must be whole lines ending in a newline")
    n = text.count(edit["old"])
    if n != 1:
        raise SystemExit(f"{label}: text to replace occurs {n} times in {edit['file']} (must be exactly once)")
    i = text.index(edit["old"])
    if i and text[i - 1] != "\n":
        raise SystemExit(f"{label}: text to replace must start at the beginning of a line")
    write(p, text.replace(edit["old"], edit["new"]))


def line_of(text, snippet):
    hits = [i for i in range(len(text)) if text.startswith(snippet, i) and (i == 0 or text[i - 1] == "\n")]
    return text[:hits[0]].count("\n") + 1 if len(hits) == 1 else None


def evidence(title, rows, results, extra=""):
    """Evidence text. Object addresses are blanked so a rebuild with the same results writes the same file."""
    lines = [title, ""]
    for t in rows:
        r = results[t["nodeid"]]
        lines.append(f"{'PASS' if r['passed'] else 'FAIL'}  {t['id']}  {t['nodeid']}  ({t['visibility']}, {t['role']})")
        if r["message"] and not r["passed"]:
            lines += [f"      {ln}".rstrip() for ln in re.sub(r"0x[0-9A-Fa-f]{6,}", "0x…", r["message"]).splitlines()]
    if extra:
        lines += ["", extra]
    return "\n".join(lines) + "\n"


def build(example):
    ex = Path(example).resolve()
    base, code = ex / "internal" / "baseline", ex / "code"
    pub, key = load(ex)
    muts = json.loads(read(ex / "internal" / "verification" / "mutations.json"))
    fixes = json.loads(read(ex / "internal" / "verification" / "fixes.json"))
    hidden = hidden_dir(ex, key)
    nodeids = [t["nodeid"] for t in key["tests"]]
    tickets = {tk["id"]: tk for tk in key["tickets"]}
    ev_dir = ex / "internal" / "evidence"
    if ev_dir.exists():
        shutil.rmtree(ev_dir)

    # ---- 1. shipped code
    if code.exists():
        for rel in tree_files(code):
            os.remove(code / rel)
    copy_tree(base, code)
    for m in muts:
        apply_edit(code, m, m["id"])
    bug_rows = []
    for m in muts:
        line = line_of(read(code / m["file"]), m["new"])
        if line is None:
            raise SystemExit(f"{m['id']}: the changed text must occur exactly once in {m['file']} (add context)")
        bug_rows.append({"id": m["id"], "file": m["file"], "line": line, "change": {"old": m["old"], "new": m["new"]}})

    # ---- 2. gate A
    on_base = run_tests(ex, base, nodeids, hidden)
    gate_a_passed = all(r["passed"] for r in on_base.values())
    write(ev_dir / "gate_a.txt", evidence("Gate A: every test on the clean baseline", key["tests"], on_base))

    # ---- 3. gate B
    on_shipped = run_tests(ex, code, nodeids, hidden)
    bug_ticket = {tk["bug_id"]: tid for tid, tk in tickets.items()}
    for row in bug_rows:
        tid = bug_ticket.get(row["id"])
        rows = [t for t in key["tests"] if t["ticket"] == tid]
        ok = bool(rows) and all(
            on_base[t["nodeid"]]["passed"] and on_shipped[t["nodeid"]]["passed"] == (t["role"] == "regression")
            for t in rows)
        name = f"{row['id']}.txt"
        write(ev_dir / name, evidence(
            f"Gate B for {row['id']} (ticket {tid}): failing tests must fail on the shipped code, regression tests must pass",
            rows, on_shipped, f"detected: {ok}"))
        row["gate_b"] = {"detected": ok, "detected_by": "test-driver" if ok else "none",
                         "evidence_file": f"internal/evidence/{name}"}

    # ---- 4. fix checks
    fix_rows = []
    for fx in fixes:
        rows = [t for t in key["tests"] if t["ticket"] == fx["ticket"]]
        with tempfile.TemporaryDirectory(prefix="fixquiz-fix-") as tmp:
            copy_tree(code, tmp)
            for i, edit in enumerate(fx["edits"]):
                apply_edit(tmp, edit, f"fix {fx['id']} edit {i + 1}")
            res = run_tests(ex, tmp, [t["nodeid"] for t in rows], hidden)
        visible_ok = all(res[t["nodeid"]]["passed"] for t in rows if t["visibility"] == "visible")
        hidden_fail = any(not res[t["nodeid"]]["passed"] for t in rows if t["visibility"] == "hidden")
        passed = all(r["passed"] for r in res.values()) if fx["kind"] == "correct" else (visible_ok and hidden_fail)
        expect = ("a correct fix passes every test of its ticket" if fx["kind"] == "correct" else
                  "a wrong fix passes the visible tests of its ticket and fails a hidden one")
        name = f"fix-{fx['id']}.txt"
        write(ev_dir / name, evidence(f"Fix check {fx['id']} ({fx['kind']}): {fx['description']}\nExpected: {expect}",
                                      rows, res, f"as expected: {passed}"))
        fix_rows.append({"id": fx["id"], "ticket": fx["ticket"], "kind": fx["kind"], "passed": passed,
                         "evidence_file": f"internal/evidence/{name}"})

    # ---- 5. public.json + manifest.json
    files = tree_files(code)
    pub["files"] = [{"path": p, "line_count": len(read(code / p).splitlines())} for p in files]
    write(ex / "public.json", json.dumps(pub, indent=2, ensure_ascii=False) + "\n")

    man_path = ex / "manifest.json"
    old = json.loads(read(man_path)) if man_path.is_file() else {}
    shipped = [{"path": p, "sha256": sha256_file(code / p)} for p in files]
    base_sha = tree_sha256(base)
    review = old.get("review", {"status": "pending"})
    if (old.get("shipped") != shipped or old.get("baseline", {}).get("sha256") != base_sha
            or old.get("fix_checks") != fix_rows or old.get("bugs") != bug_rows):
        review = {"status": "pending", "notes": "Rebuilt by fixquiz build; needs review."}
    man = {
        "schema_version": 1,
        "id": pub["id"],
        "source": {"kind": "generated", "license_spdx": pub["license"]["spdx"], "original_sha256": base_sha},
        "baseline": {
            "path": "internal/baseline",
            "sha256": base_sha,
            "changes_summary": "Hand-written clean service. code/ is generated from it by applying "
                               "internal/verification/mutations.json (python -m fixquiz build).",
            "gate_a": {"passed": gate_a_passed, "tests_run": len(on_base), "tools": ["test-driver"],
                       "evidence_file": "internal/evidence/gate_a.txt"},
        },
        "shipped": shipped,
        "bugs": bug_rows,
        "fix_checks": fix_rows,
        "review": review,
    }
    for k in ("rubric", "pilot_solve", "publish"):
        if k in old and review.get("status") == "approved":
            man[k] = old[k]
    write(man_path, json.dumps(man, indent=2, ensure_ascii=False) + "\n")

    report = [f"gate A: {'passed' if gate_a_passed else 'FAILED'} ({len(on_base)} tests)"]
    report += [f"  {r['id']}  {r['file']}:{r['line']}  detected={r['gate_b']['detected']}" for r in bug_rows]
    report += [f"  fix {f['id']} ({f['kind']}): {'ok' if f['passed'] else 'NOT AS EXPECTED'}" for f in fix_rows]
    return "\n".join(report)
