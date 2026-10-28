#!/usr/bin/env python3
"""ReadCode example validator.

Layer 1  JSON Schema: shape of public.json, key.json, manifest.json.
Layer 2  Consistency: cross-file rules and checks against the actual code.

Usage:
    python validate_example.py EXAMPLE_DIR [EXAMPLE_DIR ...] [--schemas DIR]
    python validate_example.py --all EXAMPLES_ROOT

Exit code 0 if every example has no errors (warnings are allowed), 1 otherwise.
Requires: pip install jsonschema   (optional: rfc3339-validator, rfc3987 for date/uri format checks)

Example layout (schema_version 2):
    readcode-002/
      public.json  key.json  manifest.json
      code/...                      <- the only code the candidate sees (built by tools/inject_bugs.py)
      internal/baseline/...         <- clean, self-contained code, same paths as code/
      internal/verification/...     <- e.g. tsconfig.json for the compile check
      internal/evidence/...         <- compile check outputs referenced by the manifest
"""
import argparse, hashlib, json, os, re, sys

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    sys.exit("This tool needs the 'jsonschema' package:  pip install jsonschema")

FILES = ("public", "key", "manifest")
KEY_ONLY_FIELDS = {"rubric", "point", "bugs", "description", "runtime_failure", "conditions", "fix", "grader_notes", "bug_id"}
HINT_WORDS = re.compile(r"\b(BUG|FIXME|XXX|HACK|seeded|mutant|injected|vulnerab\w*)\b", re.I)
DIMENSIONS = ("understanding", "bugs", "design", "improvements")


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


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
    for n in FILES:
        with open(os.path.join(schema_dir, f"{n}.schema.json"), encoding="utf-8") as f:
            schema = json.load(f)
        Draft202012Validator.check_schema(schema)
        out[n] = Draft202012Validator(schema, format_checker=FormatChecker())
    return out


def check_shape(rep, validators, docs):
    for n, doc in docs.items():
        for e in sorted(validators[n].iter_errors(doc), key=lambda e: list(map(str, e.path))):
            path = "/".join(map(str, e.path)) or "(root)"
            rep.err(f"{n}.json [{path}]", e.message[:200])


def in_ranges(line, ranges):
    return any(r["start_line"] <= line <= r["end_line"] for r in ranges)




def check_consistency(rep, ex, pub, key, man):
    name = os.path.basename(os.path.normpath(ex))
    code_dir = os.path.join(ex, "code")
    base_dir = os.path.join(ex, "internal", "baseline")

    # ---- identity
    if not (pub["id"] == key["id"] == man["id"]):
        rep.err("ids", f"id differs across files: public={pub['id']} key={key['id']} manifest={man['id']}")
    if pub["id"] != name:
        rep.err("ids", f"id '{pub['id']}' does not match the folder name '{name}'")
    if pub["version"] != key["version"]:
        rep.err("versions", f"public.version={pub['version']} but key.version={key['version']}")
    for field in ("language", "level"):
        if pub[field] != man[field]:
            rep.err(field, f"public says {pub[field]} but the manifest says {man[field]}")

    # ---- code files
    lines_of, shipped_text = {}, {}
    for f in pub["files"]:
        p = os.path.join(code_dir, f["path"])
        if not os.path.isfile(p):
            rep.err("public.files", f"code/{f['path']} does not exist")
            continue
        with open(p, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        shipped_text[f["path"]] = text
        lines_of[f["path"]] = text.split("\n")
        actual = len(text.splitlines())
        if actual != f["line_count"]:
            rep.err("public.files", f"{f['path']}: line_count says {f['line_count']} but the file has {actual}")
        for i, ln in enumerate(text.splitlines(), 1):
            if HINT_WORDS.search(ln):
                rep.warn("code", f"{f['path']}:{i} contains a word that may hint at a bug: {ln.strip()[:60]!r}")
    declared = {f["path"] for f in pub["files"]}
    for root, _, names in os.walk(code_dir):
        for n in names:
            rel = os.path.relpath(os.path.join(root, n), code_dir).replace(os.sep, "/")
            if rel not in declared:
                rep.warn("code", f"code/{rel} exists but is not listed in public.files (candidates would see it)")

    # ---- ids: uniqueness and matching
    def dupes(xs):
        return sorted({x for x in xs if xs.count(x) > 1})
    q_ids = [q["id"] for q in pub["questions"]]
    for label, ids in (("public.questions", q_ids), ("key.bugs", [b["id"] for b in key["bugs"]]),
                       ("key.rubric", [r["id"] for r in key["rubric"]]), ("manifest.bugs", [b["id"] for b in man["bugs"]])):
        if dupes(ids):
            rep.err(label, f"duplicate ids: {dupes(ids)}")
    kb = {b["id"] for b in key["bugs"]}
    mb = {b["id"] for b in man["bugs"]}
    if kb != mb:
        rep.err("bugs", f"key lists {sorted(kb)} but manifest records {sorted(mb)}")
    for d in DIMENSIONS:
        if not any(q["dimension"] == d for q in pub["questions"]):
            rep.warn("public.questions", f"no question for the '{d}' dimension")

    # ---- rubric
    for r in key["rubric"]:
        if r["question_id"] not in q_ids:
            rep.err(f"key.rubric[{r['id']}]", f"unknown question {r['question_id']}")
        if "bug_id" in r and r["bug_id"] not in kb:
            rep.err(f"key.rubric[{r['id']}]", f"unknown bug {r['bug_id']}")
    for q in q_ids:
        if not any(r["question_id"] == q and r["kind"] == "required" for r in key["rubric"]):
            rep.err("key.rubric", f"question {q} has no required rubric point")
    for b in sorted(kb):
        if not any(r.get("bug_id") == b and r["kind"] == "required" for r in key["rubric"]):
            rep.err("key.rubric", f"bug {b} has no required rubric point")
    if len(key["bugs"]) == 1 and key["bugs"][0]["pattern"] != man["bug_pattern"]:
        rep.err("bug_pattern", f"key says {key['bugs'][0]['pattern']} but the manifest says {man['bug_pattern']}")

    # ---- line ranges in the key
    for b in key["bugs"]:
        for r in b["locations"]:
            where = f"key.bugs[{b['id']}]"
            if r["file"] not in lines_of:
                rep.err(where, f"unknown file '{r['file']}'")
            elif r["start_line"] > r["end_line"] or r["end_line"] > len(lines_of[r["file"]]):
                rep.err(where, f"lines {r['start_line']}-{r['end_line']} are outside {r['file']}")

    # ---- manifest <-> files on disk
    for section, folder in (("baseline", base_dir), ("shipped", code_dir)):
        listed = {f["path"] for f in man[section]["files"]}
        if listed != declared:
            rep.err(f"manifest.{section}", f"lists {sorted(listed)} but public.files lists {sorted(declared)}")
        for f in man[section]["files"]:
            p = os.path.join(folder, f["path"])
            if not os.path.isfile(p):
                rep.err(f"manifest.{section}", f"{os.path.relpath(p, ex)} does not exist")
            elif sha256(p) != f["sha256"]:
                rep.err(f"manifest.{section}", f"{f['path']} was modified after the compile check ran (sha256 mismatch)")
        ev = man[section]["compile_check"]["evidence_file"]
        if not os.path.isfile(os.path.join(ex, ev)):
            rep.err(f"manifest.{section}", f"evidence file {ev} is missing")
        if not man[section]["compile_check"]["passed"]:
            rep.warn("compile", f"{section} has not passed the compile check")
    sources_to = sorted(s["code_path"] for s in man["sources"])
    for cp in sources_to:
        if cp not in declared:
            rep.err("manifest.sources", f"code_path '{cp}' is not a file in public.files")

    # ---- bugs: recorded change <-> shipped code <-> baseline <-> key
    baseline_text = {}
    for f in man["baseline"]["files"]:
        p = os.path.join(base_dir, f["path"])
        if os.path.isfile(p):
            baseline_text[f["path"]] = open(p, encoding="utf-8", errors="replace").read()
    key_bug = {b["id"]: b for b in key["bugs"]}
    key_bug.update({w["id"]: w for w in key.get("worsenings", [])})
    reverted = dict(shipped_text)
    for b in man["bugs"] + man.get("worsenings", []):
        where = f"manifest.bugs[{b['id']}]"
        lines = lines_of.get(b["file"])
        if lines is None:
            rep.err(where, f"unknown file '{b['file']}'")
            continue
        new_lines = b["change"]["new"].rstrip("\n").split("\n")
        if lines[b["line"] - 1: b["line"] - 1 + len(new_lines)] != new_lines:
            rep.err(where, f"the shipped code at line {b['line']} does not match the recorded change")
        if baseline_text.get(b["file"], "").count(b["change"]["old"]) != 1:
            rep.err(where, "the recorded clean text does not occur exactly once in the baseline file")
        if b["id"] in key_bug and not in_ranges(b["line"], key_bug[b["id"]]["locations"]):
            rep.err(where, f"line {b['line']} is not inside any location the key gives for this bug")
        reverted[b["file"]] = reverted[b["file"]].replace(b["change"]["new"], b["change"]["old"], 1)
    # Undoing every recorded bug must give back the baseline exactly: no unrecorded differences.
    for path, text in reverted.items():
        if path in baseline_text and text != baseline_text[path]:
            rep.err("baseline", f"{path}: code/ differs from the baseline by more than the recorded bugs and worsenings")

    # ---- question hints and answers held back until the bug question is done
    bug_qs = {q["id"] for q in pub["questions"] if q["dimension"] == "bugs"}
    for qid in key.get("reveal_after_bug", []):
        if qid not in q_ids:
            rep.err("key.reveal_after_bug", f"unknown question {qid}")
        elif qid in bug_qs:
            rep.err("key.reveal_after_bug", f"{qid} is a bug question; only other questions are held back")
    for q in pub["questions"]:
        if "hints" in q:
            levels = [h["level"] for h in q["hints"]]
            if levels != list(range(1, len(levels) + 1)):
                rep.err(f"public.questions[{q['id']}].hints", f"hint levels must be 1, 2, 3 in order (got {levels})")
            if q.get("report"):
                rep.err(f"public.questions[{q['id']}].hints", "a bug question keeps its hints in report.hints")

    # ---- worsenings: key <-> manifest, rubric points, the question that points at them
    kw = {w["id"] for w in key.get("worsenings", [])}
    mw = {w["id"]: w for w in man.get("worsenings", [])}
    if kw != set(mw):
        rep.err("worsenings", f"key lists {sorted(kw)} but manifest records {sorted(mw)}")
    for r in key["rubric"]:
        if "worsening_id" in r and r["worsening_id"] not in kw:
            rep.err(f"key.rubric[{r['id']}]", f"unknown worsening {r['worsening_id']}")
    for w in sorted(kw):
        if not any(r.get("worsening_id") == w and r["kind"] == "required" for r in key["rubric"]):
            rep.err("key.rubric", f"worsening {w} has no required rubric point")
    for q in pub["questions"]:
        f = q.get("focus")
        if not f:
            continue
        where = f"public.questions[{q['id']}].focus"
        if q["dimension"] != "improvements":
            rep.err(where, "a focus range belongs on a question with dimension 'improvements'")
        if f["file"] not in lines_of or not 1 <= f["start_line"] <= f["end_line"] <= len(lines_of[f["file"]]):
            rep.err(where, f"lines {f['start_line']}-{f['end_line']} are not inside {f['file']}")
        if not any(w["file"] == f["file"] and f["start_line"] <= w["line"] <= f["end_line"] for w in mw.values()):
            rep.err(where, "does not cover any worsening the manifest records")
    if mw:
        sc = man.get("scenario") or {}
        if sc.get("behaviour_preserved") is not True:
            rep.err("manifest.scenario", "worsenings must be shown not to change behaviour (run tools/run_scenario.py)")

    # ---- bug reports: only on bug questions, and every quoted line must come from the scenario run
    def evidence_lines(rel):
        p = os.path.join(ex, rel)
        if not os.path.isfile(p):
            rep.err("manifest.scenario", f"evidence file {rel} is missing")
            return None
        text = open(p, encoding="utf-8").read()
        return set(text.split("output:\n", 1)[-1].splitlines())
    for q in pub["questions"]:
        r = q.get("report")
        if not r:
            continue
        where = f"public.questions[{q['id']}].report"
        if q["dimension"] != "bugs":
            rep.err(where, "a bug report belongs on a question with dimension 'bugs'")
        levels = [h["level"] for h in r["hints"]]
        if levels != list(range(1, len(levels) + 1)):
            rep.err(where, f"hint levels must be 1, 2, 3 in order (got {levels})")
        if r["expected"] == r["observed"]:
            rep.err(where, "expected and observed are identical")
        sc = man.get("scenario")
        if not sc:
            rep.err(where, "has a bug report but the manifest has no scenario run (tools/run_scenario.py)")
            continue
        if not sc["reproduced"]:
            rep.err("manifest.scenario", "the scenario did not reproduce the bug (baseline and shipped outputs are identical)")
        for field, rel in (("expected", sc["baseline_evidence"]), ("observed", sc["shipped_evidence"])):
            lines = evidence_lines(rel)
            if lines is None:
                continue
            for line in r[field]:
                if line not in lines:
                    rep.err(where, f"{field} line not in the scenario output ({rel}): {line[:60]!r}")

    # ---- concepts shown to the candidate == everything the manifest says the example tests or contains
    shown = [c["id"] for c in pub["concepts"]]
    if dupes(shown):
        rep.err("public.concepts", f"duplicate ids: {dupes(shown)}")
    if set(shown) != set(man["tests"]) | set(man["present"]):
        rep.err("concepts", f"public shows {sorted(set(shown))} but the manifest tests + present is "
                            f"{sorted(set(man['tests']) | set(man['present']))}")

    # ---- licence and review gating
    if pub["license"]["spdx"] != man["license"]:
        rep.err("license", f"public says {pub['license']['spdx']} but the manifest says {man['license']}")
    for s in man["sources"]:
        if s["license_spdx"] != man["license"]:
            rep.warn("license", f"{s['path']} is {s['license_spdx']} but the example is {man['license']}")

    # ---- the public file must not leak grader-only content
    leaked = sorted(KEY_ONLY_FIELDS & set(walk_keys(pub)))
    if leaked:
        rep.err("public.json", f"contains grader-only fields: {leaked}")
    blob = json.dumps(pub).lower()
    for r in key["rubric"]:
        if r["point"].lower() in blob:
            rep.err("public.json", f"contains rubric point {r['id']} verbatim")
    for b in key["bugs"]:
        for field in ("description", "fix", "title"):
            if b[field].lower() in blob:
                rep.err("public.json", f"contains the {field} of bug {b['id']} verbatim")


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
        check_shape(rep, validators, docs)
        if not rep.errors:                       # consistency checks assume the shape is right
            check_consistency(rep, ex, docs["public"], docs["key"], docs["manifest"])
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
