#!/usr/bin/env python3
"""Copy the candidate-facing part of every example into the frontend.

Only public.json and the files it lists under code/ are copied (an allowlist,
never a folder copy), so key.json, manifest.json and internal/ cannot reach
the browser. public.json is schema-checked on the way out. reveal.json, the
answer checklists shown after a question is submitted or conceded, is built from
the key's rubric points only.

Usage:
    python tools/sync_public.py [--examples examples] [--out frontend/public/exercises]

Writes OUT/index.json (a summary list) and OUT/<id>/{public.json, code/...}.
Temporary: once the FastAPI backend serves exercises, this goes away.
"""
import argparse
import json
import os
import shutil
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
SUMMARY_FIELDS = ("id", "version", "title", "language", "level", "estimated_minutes", "concepts")


def reveal(pub, key):
    """The answer checklist per question, shown after the candidate submits or concedes it.

    Only the rubric points leave the key (no bug descriptions, fixes or grader notes). Questions in
    key.reveal_after_bug are shown only after the bug question is done. Until there is an API that
    sends answers per question after submission, this file is readable by anyone who looks for it.
    """
    return {
        "id": pub["id"],
        "version": pub["version"],
        "bug_questions": [q["id"] for q in pub["questions"] if q["dimension"] == "bugs"],
        "after_bug": key.get("reveal_after_bug", []),
        "answers": {q["id"]: [{"id": r["id"], "kind": r["kind"], "point": r["point"]}
                              for r in key["rubric"] if r["question_id"] == q["id"]] for q in pub["questions"]},
    }


def sync(examples, out):
    validator = Draft202012Validator(json.loads((ROOT / "schemas" / "public.schema.json").read_text()))
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    index = []
    for ex in sorted(p for p in examples.iterdir() if (p / "public.json").is_file()):
        pub = json.loads((ex / "public.json").read_text())
        errs = [e.message for e in validator.iter_errors(pub)]
        if errs:
            sys.exit(f"{ex.name}/public.json fails its schema: {errs[0]}")
        dst = out / pub["id"]
        (dst / "code").mkdir(parents=True)
        (dst / "public.json").write_text(json.dumps(pub, indent=2))
        for f in pub["files"]:
            src = (ex / "code" / f["path"]).resolve()
            if not src.is_relative_to((ex / "code").resolve()):
                sys.exit(f"{ex.name}: {f['path']} points outside code/")
            target = dst / "code" / f["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, target)
        (dst / "reveal.json").write_text(json.dumps(reveal(pub, json.loads((ex / "key.json").read_text())), indent=2))
        index.append({k: pub[k] for k in SUMMARY_FIELDS} | {"line_count": sum(f["line_count"] for f in pub["files"])})
    (out / "index.json").write_text(json.dumps(index, indent=2))
    return index


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--examples", type=Path, default=ROOT / "examples")
    ap.add_argument("--out", type=Path, default=ROOT / "frontend" / "public" / "exercises")
    a = ap.parse_args()
    index = sync(a.examples, a.out)
    print(f"synced {len(index)} exercise(s) to {os.path.relpath(a.out)}: {', '.join(e['id'] for e in index)}")


if __name__ == "__main__":
    main()
