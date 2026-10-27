#!/usr/bin/env python3
"""ReadCode example validator.

Layer 1  JSON Schema: shape of public.json, key.json, manifest.json.
Layer 2  Consistency: cross-file rules and checks against the actual code.

Usage:
    python validate_example.py EXAMPLE_DIR [EXAMPLE_DIR ...] [--schemas DIR]
    python validate_example.py --all EXAMPLES_ROOT

Exit code 0 if every example has no errors (warnings are allowed), 1 otherwise.
Requires: pip install jsonschema   (optional: rfc3339-validator, rfc3987 for date/uri format checks)

Example layout:
    readcode-001/
      public.json  key.json  manifest.json
      code/...                      <- the only code the candidate sees
      internal/baseline/...         <- clean reference code (one file, or a folder)
      internal/evidence/...         <- gate outputs referenced by the manifest

Two formats, picked by public.json "format":
    review    (default) comprehension, bug and design answers graded against key.json
    fix_quiz  tickets fixed in an IDE and graded by visible + hidden tests, then multiple choice
"""
import argparse, hashlib, json, math, os, re, sys

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    sys.exit("This tool needs the 'jsonschema' package:  pip install jsonschema")

FILES = ("public", "key", "manifest")
SCHEMAS = {"review": {"public": "public", "key": "key", "manifest": "manifest"},
           "fix_quiz": {"public": "fixquiz-public", "key": "fixquiz-key", "manifest": "manifest"}}
KEY_ONLY_FIELDS = {"key_points", "anchors", "mechanism_anchors", "red_herrings", "fix", "grader_instructions"}
FIXQUIZ_KEY_ONLY_FIELDS = {"answer", "explanations", "root_cause", "wrong_fixes", "hidden_tests_dir", "role", "points", "checks"}
HINT_WORDS = re.compile(r"\b(BUG|FIXME|XXX|HACK|seeded|mutant|injected|vulnerab\w*)\b", re.I)
SKIP_DIRS = {"__pycache__", ".pytest_cache", ".venv", ".git"}


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def tree_files(root):
    """Same definition as backend/fixquiz/runner.py: sorted relative paths, caches skipped."""
    out = []
    for d, dirs, names in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        rel = os.path.relpath(d, root)
        out += [os.path.normpath(os.path.join(rel, n)).replace(os.sep, "/")
                for n in names if not n.endswith((".pyc", ".db"))]
    return sorted(out)


def tree_sha256(root):
    lines = "".join(f"{sha256(os.path.join(root, p))}  {p}\n" for p in tree_files(root))
    return hashlib.sha256(lines.encode()).hexdigest()


def walk_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from walk_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_keys(v)


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def load_schemas(schema_dir):
    out = {}
    for n in sorted({s for fmt in SCHEMAS.values() for s in fmt.values()}):
        with open(os.path.join(schema_dir, f"{n}.schema.json"), encoding="utf-8") as f:
            schema = json.load(f)
        Draft202012Validator.check_schema(schema)
        out[n] = Draft202012Validator(schema, format_checker=FormatChecker())
    return out


def check_shape(rep, validators, docs, fmt="review"):
    for n, doc in docs.items():
        for e in sorted(validators[SCHEMAS[fmt][n]].iter_errors(doc), key=lambda e: list(map(str, e.path))):
            path = "/".join(map(str, e.path)) or "(root)"
            rep.err(f"{n}.json [{path}]", e.message[:200])


def in_ranges(line, ranges):
    return any(r["start_line"] <= line <= r["end_line"] for r in ranges)


def dupes(xs):
    return sorted({x for x in xs if xs.count(x) > 1})


def check_identity_and_files(rep, ex, pub, key, man):
    """Checks every format shares. Returns ({path: lines}, set of declared paths)."""
    name = os.path.basename(os.path.normpath(ex))
    code_dir = os.path.join(ex, "code")

    # ---- identity
    if not (pub["id"] == key["id"] == man["id"]):
        rep.err("ids", f"id differs across files: public={pub['id']} key={key['id']} manifest={man['id']}")
    if pub["id"] != name:
        rep.err("ids", f"id '{pub['id']}' does not match the folder name '{name}'")
    if pub["version"] != key["version"]:
        rep.err("versions", f"public.version={pub['version']} but key.version={key['version']}")

    # ---- code files
    lines_of = {}
    for f in pub["files"]:
        p = os.path.join(code_dir, f["path"])
        if not os.path.isfile(p):
            rep.err("public.files", f"code/{f['path']} does not exist")
            continue
        with open(p, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        lines_of[f["path"]] = text.split("\n")
        actual = len(text.splitlines())
        if actual != f["line_count"]:
            rep.err("public.files", f"{f['path']}: line_count says {f['line_count']} but the file has {actual}")
        for i, ln in enumerate(text.splitlines(), 1):
            if HINT_WORDS.search(ln):
                rep.warn("code", f"{f['path']}:{i} contains a word that may hint at a bug: {ln.strip()[:60]!r}")
    declared = {f["path"] for f in pub["files"]}
    for rel in tree_files(code_dir):
        if rel not in declared:
            rep.warn("code", f"code/{rel} exists but is not listed in public.files (candidates would see it)")
    return lines_of, declared


def check_consistency(rep, ex, pub, key, man):
    """The review format: comprehension, bugs, design and improvements graded against key.json."""
    lines_of, declared = check_identity_and_files(rep, ex, pub, key, man)

    # ---- ids: uniqueness and matching
    q_ids = [q["id"] for q in pub["questions"]]
    d_ids = [d["id"] for d in pub["design_prompts"]]
    for label, ids in (("public.questions", q_ids), ("public.design_prompts", d_ids),
                       ("key.comprehension", [c["question_id"] for c in key["comprehension"]]),
                       ("key.design", [d["prompt_id"] for d in key["design"]]),
                       ("key.bugs", [b["id"] for b in key["bugs"]]),
                       ("manifest.bugs", [b["id"] for b in man["bugs"]])):
        if dupes(ids):
            rep.err(label, f"duplicate ids: {dupes(ids)}")
    kq = {c["question_id"] for c in key["comprehension"]}
    kd = {d["prompt_id"] for d in key["design"]}
    if kq != set(q_ids):
        rep.err("questions", f"public has {sorted(q_ids)} but key scores {sorted(kq)}")
    if kd != set(d_ids):
        rep.err("design", f"public has {sorted(d_ids)} but key scores {sorted(kd)}")
    kb = {b["id"] for b in key["bugs"]}
    mb = {b["id"] for b in man["bugs"]}
    if kb != mb:
        rep.err("bugs", f"key lists {sorted(kb)} but manifest records {sorted(mb)}")

    # ---- weights
    close = lambda a, b: math.isclose(a, b, abs_tol=1e-6)
    sec = key["scoring"]["sections"]
    sums = {"comprehension": sum(c["weight"] for c in key["comprehension"]),
            "bugs": sum(b["weight"] for b in key["bugs"]),
            "design": sum(d["weight"] for d in key["design"]),
            "improvements": sum(t["weight"] for t in key["improvements"]["expected_themes"])}
    for s, total in sums.items():
        if not close(total, sec[s]):
            rep.err("key.scoring", f"{s}: item weights sum to {total} but the section is {sec[s]}")
    if not close(key["improvements"]["weight"], sec["improvements"]):
        rep.err("key.improvements", f"weight {key['improvements']['weight']} != section {sec['improvements']}")
    if not close(sum(sec.values()), key["scoring"]["total"]):
        rep.err("key.scoring", f"sections sum to {sum(sec.values())}, total is {key['scoring']['total']}")

    # ---- line ranges in the key
    def check_range(where, r):
        if r["file"] not in lines_of:
            rep.err(where, f"unknown file '{r['file']}'")
        elif r["start_line"] > r["end_line"] or r["end_line"] > len(lines_of[r["file"]]):
            rep.err(where, f"lines {r['start_line']}-{r['end_line']} are outside {r['file']}")
    for b in key["bugs"]:
        for r in b["locations"]:
            check_range(f"key.bugs[{b['id']}]", r)
    for i, h in enumerate(key["red_herrings"]):
        for r in h.get("locations", []):
            check_range(f"key.red_herrings[{i}]", r)

    key_bug = {b["id"]: b for b in key["bugs"]}
    check_manifest(rep, ex, pub, man, lines_of, declared, key_bug)

    # ---- the public file must not leak grader-only content
    leaked = sorted(KEY_ONLY_FIELDS & set(walk_keys(pub)))
    if leaked:
        rep.err("public.json", f"contains grader-only fields: {leaked}")
    blob = json.dumps(pub).lower()
    for c in key["comprehension"]:
        for kp in c["key_points"]:
            if len(kp) > 25 and kp.lower() in blob:
                rep.err("public.json", f"contains an answer key point verbatim: {kp[:50]!r}")


def check_manifest(rep, ex, pub, man, lines_of, declared, key_bug=None):
    """manifest <-> code <-> baseline: hashes, recorded changes, evidence, licence, review gating.

    key_bug maps bug id -> key entry with `locations`; when given, each bug's line must fall inside one.
    """
    code_dir = os.path.join(ex, "code")
    baseline_file, baseline_dir = None, None
    bpath = man["baseline"].get("path")
    if bpath:
        full = os.path.join(ex, bpath)
        if os.path.isfile(full):
            baseline_file = open(full, encoding="utf-8", errors="replace").read()
            if sha256(full) != man["baseline"]["sha256"]:
                rep.err("manifest.baseline", "sha256 does not match the baseline file")
        elif os.path.isdir(full):
            baseline_dir = full
            if tree_sha256(full) != man["baseline"]["sha256"]:
                rep.err("manifest.baseline", "sha256 does not match the baseline folder")
        else:
            rep.err("manifest.baseline", f"{bpath} does not exist")
    else:
        rep.warn("manifest.baseline", "no baseline path given; cannot check that each bug's clean text exists")

    def clean_text(file):
        if baseline_file is not None:
            return baseline_file
        if baseline_dir is not None:
            p = os.path.join(baseline_dir, file)
            return open(p, encoding="utf-8", errors="replace").read() if os.path.isfile(p) else ""
        return None

    shipped_paths = {s["path"] for s in man["shipped"]}
    if shipped_paths != declared:
        rep.err("manifest.shipped", f"lists {sorted(shipped_paths)} but public.files lists {sorted(declared)}")
    for s in man["shipped"]:
        p = os.path.join(code_dir, s["path"])
        if os.path.isfile(p) and sha256(p) != s["sha256"]:
            rep.err("manifest.shipped", f"{s['path']} was modified after the checks ran (sha256 mismatch)")

    for b in man["bugs"]:
        where = f"manifest.bugs[{b['id']}]"
        lines = lines_of.get(b["file"])
        if lines is None:
            rep.err(where, f"unknown file '{b['file']}'")
        else:
            new_lines = b["change"]["new"].rstrip("\n").split("\n")
            got = lines[b["line"] - 1: b["line"] - 1 + len(new_lines)]
            if got != new_lines:
                rep.err(where, f"the shipped code at line {b['line']} does not match the recorded change")
        text = clean_text(b["file"])
        if text is not None and b["change"]["old"] not in text:
            rep.err(where, "the recorded clean text is not in the baseline file")
        if key_bug and b["id"] in key_bug and not in_ranges(b["line"], key_bug[b["id"]]["locations"]):
            rep.err(where, f"line {b['line']} is not inside any location the key gives for this bug")
        ev = os.path.join(ex, b["gate_b"]["evidence_file"])
        if not os.path.isfile(ev):
            rep.err(where, f"evidence file {b['gate_b']['evidence_file']} is missing")
        if b["gate_b"]["detected"] != (b["gate_b"]["detected_by"] != "none"):
            rep.err(where, "detected and detected_by contradict each other")
    ev = man["baseline"]["gate_a"].get("evidence_file")
    if ev and not os.path.isfile(os.path.join(ex, ev)):
        rep.err("manifest.baseline", f"evidence file {ev} is missing")
    for fc in man.get("fix_checks", []):
        if not os.path.isfile(os.path.join(ex, fc["evidence_file"])):
            rep.err(f"manifest.fix_checks[{fc['id']}]", f"evidence file {fc['evidence_file']} is missing")

    # ---- licence and review gating
    if pub["license"]["spdx"] != man["source"]["license_spdx"]:
        rep.err("license", f"public says {pub['license']['spdx']} but the manifest says {man['source']['license_spdx']}")
    status = man["review"]["status"]
    undetected = [b["id"] for b in man["bugs"] if not b["gate_b"]["detected"]]
    failed_fixes = [fc["id"] for fc in man.get("fix_checks", []) if not fc["passed"]]
    if status == "approved" and undetected:
        rep.err("review", f"approved, but these bugs were never detected by a check: {undetected}")
    elif undetected:
        rep.warn("gates", f"bugs not detected by any check (cannot be approved yet): {undetected}")
    if status == "approved" and failed_fixes:
        rep.err("review", f"approved, but these fix checks did not behave as expected: {failed_fixes}")
    elif failed_fixes:
        rep.warn("gates", f"fix checks that did not behave as expected (cannot be approved yet): {failed_fixes}")
    if not man["baseline"]["gate_a"]["passed"] and status != "approved":
        rep.warn("gates", "gate A (clean baseline) has not passed")
    if "publish" in man and status != "approved":
        rep.err("publish", "has publish info but review status is not 'approved'")


def check_fix_quiz(rep, ex, pub, key, man):
    """The fix_quiz format: tickets graded by tests (some hidden), then multiple-choice questions."""
    lines_of, declared = check_identity_and_files(rep, ex, pub, key, man)
    fix, quiz = pub["fix"], pub["quiz"]
    if fix["minutes"] + quiz["minutes"] != pub["estimated_minutes"]:
        rep.err("public", f"estimated_minutes is {pub['estimated_minutes']} but the sections take "
                          f"{fix['minutes']} + {quiz['minutes']}")

    # ---- tickets
    p_tickets = [t["id"] for t in fix["tickets"]]
    k_tickets = [t["id"] for t in key["tickets"]]
    for label, ids in (("public.fix.tickets", p_tickets), ("key.tickets", k_tickets)):
        if dupes(ids):
            rep.err(label, f"duplicate ids: {dupes(ids)}")
    if set(p_tickets) != set(k_tickets):
        rep.err("tickets", f"public has {sorted(p_tickets)} but key has {sorted(k_tickets)}")

    # ---- tests
    tests = key["tests"]
    for label, ids in (("key.tests ids", [t["id"] for t in tests]), ("key.tests nodeids", [t["nodeid"] for t in tests])):
        if dupes(ids):
            rep.err(label, f"duplicates: {dupes(ids)}")
    for t in tests:
        if t["ticket"] not in p_tickets:
            rep.err(f"key.tests[{t['id']}]", f"unknown ticket '{t['ticket']}'")
    for tid in p_tickets:
        if not any(t["ticket"] == tid and t["role"] == "failing" for t in tests):
            rep.err("key.tests", f"ticket {tid} has no failing test, so fixing it cannot be detected")
    visible_key = {(t["nodeid"], t["ticket"]) for t in tests if t["visibility"] == "visible"}
    visible_pub = {(v["nodeid"], v["ticket"]) for v in fix["visible_tests"]}
    if visible_key != visible_pub:
        rep.err("visible_tests", f"public lists {sorted(visible_pub - visible_key) or 'the same'} that the key "
                                 f"doesn't, and the key lists {sorted(visible_key - visible_pub) or 'the same'} that public doesn't")
    hidden = [t for t in tests if t["visibility"] == "hidden"]
    if len(hidden) != fix["hidden_test_count"]:
        rep.err("public.fix", f"hidden_test_count is {fix['hidden_test_count']} but the key has {len(hidden)} hidden tests")

    hidden_dir = os.path.join(ex, key["hidden_tests_dir"])
    if not os.path.isdir(hidden_dir):
        rep.err("key.hidden_tests_dir", f"{key['hidden_tests_dir']} does not exist")
    for t in tests:
        path, name = t["nodeid"].split("::")
        if t["visibility"] == "visible":
            if path not in declared:
                rep.err(f"key.tests[{t['id']}]", f"{path} is not in public.files")
                continue
            full = os.path.join(ex, "code", path)
        else:
            if path in declared:
                rep.err(f"key.tests[{t['id']}]", f"hidden test file {path} has the same name as a visible one")
            full = os.path.join(hidden_dir, path[len("tests/"):])
        if not os.path.isfile(full):
            rep.err(f"key.tests[{t['id']}]", f"{os.path.relpath(full, ex)} does not exist")
        elif not re.search(rf"^def {re.escape(name)}\(", open(full, encoding="utf-8").read(), re.M):
            rep.err(f"key.tests[{t['id']}]", f"no test function {name} in {os.path.relpath(full, ex)}")

    # ---- points
    close = lambda a, b: math.isclose(a, b, abs_tol=1e-6)
    sec = key["scoring"]["sections"]
    for s, total in (("fix", sum(t["points"] for t in tests)), ("quiz", sum(q["points"] for q in key["quiz"]))):
        if not close(total, sec[s]):
            rep.err("key.scoring", f"{s}: item points sum to {total} but the section is {sec[s]}")
    if not close(sum(sec.values()), key["scoring"]["total"]):
        rep.err("key.scoring", f"sections sum to {sum(sec.values())}, total is {key['scoring']['total']}")

    # ---- quiz
    p_q = {q["id"]: q for q in quiz["questions"]}
    k_q = [q["question_id"] for q in key["quiz"]]
    for label, ids in (("public.quiz.questions", [q["id"] for q in quiz["questions"]]), ("key.quiz", k_q)):
        if dupes(ids):
            rep.err(label, f"duplicate ids: {dupes(ids)}")
    if set(p_q) != set(k_q):
        rep.err("quiz", f"public has {sorted(p_q)} but key scores {sorted(k_q)}")
    for kq in key["quiz"]:
        q = p_q.get(kq["question_id"])
        if not q:
            continue
        opts = [o["id"] for o in q["options"]]
        where = f"key.quiz[{kq['question_id']}]"
        if dupes(opts):
            rep.err(f"public.quiz[{q['id']}]", f"duplicate option ids: {dupes(opts)}")
        if kq["answer"] not in opts:
            rep.err(where, f"answer '{kq['answer']}' is not one of the options {opts}")
        extra = sorted(set(kq["explanations"]) - set(opts))
        if extra:
            rep.err(where, f"explanations for options that don't exist: {extra}")
        missing = sorted(set(opts) - set(kq["explanations"]))
        if missing:
            rep.warn(where, f"no explanation for options {missing} (the report shows one for each pick)")

    # ---- manifest
    bug_ids = [t["bug_id"] for t in key["tickets"]]
    if set(bug_ids) != {b["id"] for b in man["bugs"]}:
        rep.err("bugs", f"key tickets point at {sorted(bug_ids)} but the manifest records {sorted(b['id'] for b in man['bugs'])}")
    for fc in man.get("fix_checks", []):
        if fc["ticket"] not in p_tickets:
            rep.err(f"manifest.fix_checks[{fc['id']}]", f"unknown ticket '{fc['ticket']}'")
    check_manifest(rep, ex, pub, man, lines_of, declared)

    # ---- the public file and the shipped code must not leak grader-only content
    leaked = sorted(FIXQUIZ_KEY_ONLY_FIELDS & set(walk_keys(pub)))
    if leaked:
        rep.err("public.json", f"contains grader-only fields: {leaked}")
    blob = json.dumps(pub).lower()
    secrets = [x for kq in key["quiz"] for x in kq["explanations"].values()]
    secrets += [x for t in key["tickets"] for x in (t["root_cause"], t["fix"], *t.get("wrong_fixes", []))]
    for s in secrets:
        if len(s) > 25 and s.lower() in blob:
            rep.err("public.json", f"contains answer-key text verbatim: {s[:50]!r}")
    code_text = "\n".join("\n".join(lines) for lines in lines_of.values())
    for t in hidden:
        name = t["nodeid"].split("::")[1]
        if name.lower() in blob:
            rep.err("public.json", f"names the hidden test {name}")
        if name in code_text:
            rep.err("code", f"names the hidden test {name}")


def validate(ex, validators):
    rep, docs = Report(), {}
    for n in FILES:
        p = os.path.join(ex, f"{n}.json")
        if not os.path.isfile(p):
            rep.err(f"{n}.json", "file is missing")
            continue
        try:
            with open(p, encoding="utf-8") as f:
                docs[n] = json.load(f)
        except json.JSONDecodeError as e:
            rep.err(f"{n}.json", f"not valid JSON: {e}")
    if len(docs) == len(FILES):
        fmt = docs["public"].get("format", "review") if isinstance(docs["public"], dict) else "review"
        if fmt not in SCHEMAS:
            rep.err("public.json", f"unknown format '{fmt}' (expected one of {sorted(SCHEMAS)})")
            return rep
        check_shape(rep, validators, docs, fmt)
        if not rep.errors:                       # consistency checks assume the shape is right
            check = check_fix_quiz if fmt == "fix_quiz" else check_consistency
            check(rep, ex, docs["public"], docs["key"], docs["manifest"])
    return rep


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dirs", nargs="*", help="example folders")
    ap.add_argument("--all", metavar="ROOT", help="validate every sub-folder of ROOT that has a manifest.json")
    ap.add_argument("--schemas", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "schemas"))
    a = ap.parse_args()
    dirs = list(a.dirs)
    if a.all:
        dirs += sorted(os.path.join(a.all, d) for d in os.listdir(a.all)
                       if os.path.isfile(os.path.join(a.all, d, "manifest.json")))
    if not dirs:
        ap.error("give at least one example folder, or --all ROOT")
    validators = load_schemas(a.schemas)
    bad = 0
    for ex in dirs:
        rep = validate(ex, validators)
        print(f"{'FAIL' if rep.errors else 'OK  '}  {ex}  ({len(rep.errors)} errors, {len(rep.warnings)} warnings)")
        for m in rep.errors:
            print(f"   ERROR  {m}")
        for m in rep.warnings:
            print(f"   warn   {m}")
        bad += bool(rep.errors)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
