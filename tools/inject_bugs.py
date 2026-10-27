#!/usr/bin/env python3
"""Build code/ from internal/baseline/ by applying the bugs recorded in manifest.json.

Each manifest.bugs[].change.old must occur exactly once in the baseline file; it is
replaced by change.new. The tool then records the line where change.new starts
(manifest.bugs[].line) and the line counts in public.json, so neither is typed by hand.

Usage:
    python tools/inject_bugs.py examples/readcode-002

code/ is rewritten from scratch (only the files listed in manifest.baseline.files).
Run tools/compile_check.py afterwards: it pins the new hashes.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path


class InjectError(Exception):
    pass


def inject(ex):
    ex = Path(ex)
    man_p, pub_p = ex / "manifest.json", ex / "public.json"
    man, pub = json.loads(man_p.read_text()), json.loads(pub_p.read_text())
    base = ex / "internal" / "baseline"
    texts = {f["path"]: (base / f["path"]).read_text() for f in man["baseline"]["files"]}

    for b in man["bugs"]:
        old, new = b["change"]["old"], b["change"]["new"]
        if b["file"] not in texts:
            raise InjectError(f"{b['id']}: {b['file']} is not a baseline file")
        text = texts[b["file"]]
        n = text.count(old)
        if n != 1:
            raise InjectError(f"{b['id']}: change.old occurs {n} times in {b['file']} (must be exactly once)")
        at = text.index(old)
        texts[b["file"]] = text[:at] + new + text[at + len(old):]
        # Bugs applied later may shift lines, so lines are computed after all are applied (below).

    for b in man["bugs"]:
        text = texts[b["file"]]
        if text.count(b["change"]["new"]) != 1:
            raise InjectError(f"{b['id']}: change.new is not unique in the shipped {b['file']}; widen the context")
        b["line"] = text[: text.index(b["change"]["new"])].count("\n") + 1

    code = ex / "code"
    if code.exists():
        shutil.rmtree(code)
    for path, text in texts.items():
        (code / path).parent.mkdir(parents=True, exist_ok=True)
        (code / path).write_text(text)

    counts = {p: len(t.splitlines()) for p, t in texts.items()}
    listed = {f["path"] for f in pub["files"]}
    if listed != set(counts):
        raise InjectError(f"public.files lists {sorted(listed)} but the baseline has {sorted(counts)}")
    for f in pub["files"]:
        f["line_count"] = counts[f["path"]]

    man_p.write_text(json.dumps(man, indent=2) + "\n")
    pub_p.write_text(json.dumps(pub, indent=2) + "\n")
    return {b["id"]: (b["file"], b["line"]) for b in man["bugs"]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("example")
    a = ap.parse_args()
    try:
        placed = inject(a.example)
    except InjectError as e:
        sys.exit(f"inject_bugs: {e}")
    for bid, (f, line) in placed.items():
        print(f"{bid}: {f}:{line}")


if __name__ == "__main__":
    main()
