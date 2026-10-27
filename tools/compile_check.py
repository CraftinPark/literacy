#!/usr/bin/env python3
"""Compile check for TypeScript examples (pipeline steps 6 and 7).

Type-checks internal/baseline/ and code/ separately with `tsc --noEmit`, using the
example's internal/verification/tsconfig.json and the pinned toolchain in tools/ts/.
Writes one evidence file per target and records the result and the file hashes in
manifest.json (baseline.* and shipped.*). Editing either folder means rerunning this.

Usage:
    (cd tools/ts && npm install)          # once
    python tools/compile_check.py examples/readcode-002

Exit 0 if both targets compile, 1 otherwise.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLCHAIN = ROOT / "tools" / "ts"
TSC = TOOLCHAIN / "node_modules" / ".bin" / "tsc"
TARGETS = {"baseline": "internal/baseline", "shipped": "code"}


class CompileCheckError(Exception):
    pass


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tsc_version():
    return subprocess.run([str(TSC), "--version"], capture_output=True, text=True, check=True).stdout.split()[-1]


def check_target(ex, folder, files, tsconfig):
    """Run tsc on the given files. Returns (passed, scrubbed output)."""
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Path(tmp) / "tsconfig.json"
        cfg.write_text(json.dumps({
            "extends": str(tsconfig),
            "compilerOptions": {"typeRoots": [str(TOOLCHAIN / "node_modules" / "@types")], "noEmit": True},
            "files": [str(ex / folder / f) for f in files],
        }))
        r = subprocess.run([str(TSC), "-p", str(cfg), "--pretty", "false"], capture_output=True, text=True, cwd=ex)
    out = (r.stdout + r.stderr).replace(str(ex.resolve()), "<example>").replace(str(ex), "<example>")
    return r.returncode == 0, out


def run(ex):
    ex = Path(ex).resolve()
    man_p = ex / "manifest.json"
    man = json.loads(man_p.read_text())
    if man["language"] != "typescript":
        raise CompileCheckError(f"compile_check handles typescript only, not {man['language']}")
    if not TSC.exists():
        raise CompileCheckError("TypeScript toolchain missing: run `npm install` in tools/ts")
    tsconfig = ex / "internal" / "verification" / "tsconfig.json"
    if not tsconfig.is_file():
        raise CompileCheckError("internal/verification/tsconfig.json is missing")

    files = [f["path"] for f in man["baseline"]["files"]]
    version = tsc_version()
    command = "tsc --noEmit -p internal/verification/tsconfig.json (files: " + ", ".join(files) + ")"
    results = {}
    for name, folder in TARGETS.items():
        missing = [f for f in files if not (ex / folder / f).is_file()]
        if missing:
            raise CompileCheckError(f"{folder}/ is missing {missing}")
        passed, out = check_target(ex, folder, files, tsconfig)
        evidence = f"internal/evidence/compile_{name}.txt"
        pinned = [{"path": f, "sha256": sha256(ex / folder / f)} for f in files]
        lines = [f"target: {folder}/", f"tool: tsc {version}", f"command: {command}",
                 *[f"file: {p['path']} sha256={p['sha256']}" for p in pinned],
                 f"result: {'PASS' if passed else 'FAIL'}", "output:", out.rstrip() or "(none)"]
        (ex / evidence).parent.mkdir(parents=True, exist_ok=True)
        (ex / evidence).write_text("\n".join(lines) + "\n")
        man[name]["files"] = pinned
        man[name]["compile_check"] = {"passed": passed, "tool": f"tsc {version}", "command": command, "evidence_file": evidence}
        results[name] = (passed, out)
    man_p.write_text(json.dumps(man, indent=2) + "\n")
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("example")
    a = ap.parse_args()
    try:
        results = run(a.example)
    except CompileCheckError as e:
        sys.exit(f"compile_check: {e}")
    for name, (passed, out) in results.items():
        print(f"{'PASS' if passed else 'FAIL'}  {name}")
        if not passed:
            print(out.rstrip())
    sys.exit(0 if all(p for p, _ in results.values()) else 1)


if __name__ == "__main__":
    main()
