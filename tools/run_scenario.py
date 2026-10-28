#!/usr/bin/env python3
"""Run an example's bug-report scenario on the clean and the shipped code (evidence for the bug report).

The scenario is internal/verification/scenario.ts. It imports the exercise files by their paths
under code/ (e.g. './worker'), drives them with in-memory stand-ins, and prints what a user would
observe. The tool compiles it together with internal/baseline/ and, separately, with code/, runs
each with Node, and writes both outputs as evidence. The bug reproduces when the outputs differ.

The bug report in public.json quotes these outputs: its `expected` lines must appear in the
baseline output and its `observed` lines in the shipped output (the validator checks this).

Usage:
    python tools/run_scenario.py examples/readcode-005

Exit 0 if both runs finished and the outputs differ, 1 otherwise.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLCHAIN = ROOT / "tools" / "ts"
TSC = TOOLCHAIN / "node_modules" / ".bin" / "tsc"
TARGETS = {"baseline": "internal/baseline", "shipped": "code"}
TIMEOUT_S = 60


class ScenarioError(Exception):
    pass


def run_python_target(ex, folder, files, changes=()):
    """Run internal/verification/scenario.py next to a copy of the files (with `changes` applied)."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for f in files:
            (tmp / f).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ex / folder / f, tmp / f)
        for c in changes:
            target = tmp / c["file"]
            target.write_text(target.read_text().replace(c["change"]["old"], c["change"]["new"], 1))
        shutil.copyfile(ex / "internal" / "verification" / "scenario.py", tmp / "scenario.py")
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        try:
            r = subprocess.run([sys.executable, "scenario.py"], cwd=tmp, capture_output=True, text=True, timeout=TIMEOUT_S, env=env)
        except subprocess.TimeoutExpired:
            return False, f"scenario did not finish within {TIMEOUT_S}s"
        out = r.stdout.replace(str(tmp), "<tmp>")
        return r.returncode == 0, out if r.returncode == 0 else out + "\nexit code %d\n%s" % (r.returncode, r.stderr[-2000:])


def run_target(ex, folder, files, changes=()):
    """Compile the files in `folder` (with `changes` applied) plus the scenario to CommonJS and run it.
    Returns (ok, output)."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for f in files:
            (tmp / f).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ex / folder / f, tmp / f)
        for c in changes:
            target = tmp / c["file"]
            target.write_text(target.read_text().replace(c["change"]["old"], c["change"]["new"], 1))
        shutil.copyfile(ex / "internal" / "verification" / "scenario.ts", tmp / "scenario.ts")
        (tmp / "tsconfig.json").write_text(json.dumps({
            "extends": str(ex / "internal" / "verification" / "tsconfig.json"),
            # CommonJS so Node runs the output without a package.json or file extensions.
            "compilerOptions": {
                "noEmit": False, "outDir": str(tmp / "out"), "rootDir": str(tmp), "module": "commonjs",
                "moduleResolution": "node10", "declaration": False, "sourceMap": False, "types": ["node"],
                "typeRoots": [str(TOOLCHAIN / "node_modules" / "@types")],
            },
            "files": [str(tmp / f) for f in files] + [str(tmp / "scenario.ts")],
        }))
        build = subprocess.run([str(TSC), "-p", str(tmp / "tsconfig.json"), "--pretty", "false"], capture_output=True, text=True)
        if build.returncode:
            return False, "compile failed:\n" + (build.stdout + build.stderr).replace(str(tmp), "<tmp>")
        try:
            r = subprocess.run(["node", str(tmp / "out" / "scenario.js")], capture_output=True, text=True, timeout=TIMEOUT_S)
        except subprocess.TimeoutExpired:
            return False, f"scenario did not finish within {TIMEOUT_S}s"
        out = r.stdout.replace(str(tmp), "<tmp>")
        return r.returncode == 0, out if r.returncode == 0 else out + "\nexit code %d\n%s" % (r.returncode, r.stderr[-2000:])


def run(ex):
    ex = Path(ex).resolve()
    man_p = ex / "manifest.json"
    man = json.loads(man_p.read_text())
    python = man["language"] == "python"
    harness = "internal/verification/scenario." + ("py" if python else "ts")
    if not (ex / harness).is_file():
        raise ScenarioError(f"{harness} is missing")
    if not python and not TSC.exists():
        raise ScenarioError("TypeScript toolchain missing: run `npm install` in tools/ts")
    runner = run_python_target if python else run_target
    files = [f["path"] for f in man["baseline"]["files"]]
    outputs = {}
    for name, folder in TARGETS.items():
        ok, out = runner(ex, folder, files)
        if not ok:
            raise ScenarioError(f"{name} run failed:\n{out}")
        outputs[name] = out
        evidence = ex / "internal" / "evidence" / f"scenario_{name}.txt"
        evidence.parent.mkdir(parents=True, exist_ok=True)
        evidence.write_text(f"target: {folder}/\ncommand: node scenario.js (scenario.ts compiled with the example's tsconfig)\noutput:\n{out}")
    reproduced = outputs["baseline"] != outputs["shipped"]
    man["scenario"] = {
        "harness": harness,
        "reproduced": reproduced,
        "baseline_evidence": "internal/evidence/scenario_baseline.txt",
        "shipped_evidence": "internal/evidence/scenario_shipped.txt",
    }
    if man.get("worsenings"):
        # Baseline plus only the worsenings must behave exactly like the baseline.
        ok, out = runner(ex, TARGETS["baseline"], files, man["worsenings"])
        if not ok:
            raise ScenarioError(f"worsened run failed:\n{out}")
        outputs["worsened"] = out
        (ex / "internal" / "evidence" / "scenario_worsened.txt").write_text(
            f"target: internal/baseline/ + worsenings only\ncommand: node scenario.js\noutput:\n{out}")
        man["scenario"]["worsened_evidence"] = "internal/evidence/scenario_worsened.txt"
        man["scenario"]["behaviour_preserved"] = out == outputs["baseline"]
    man_p.write_text(json.dumps(man, indent=2) + "\n")
    return reproduced, outputs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("example")
    a = ap.parse_args()
    try:
        reproduced, outputs = run(a.example)
    except ScenarioError as e:
        sys.exit(f"run_scenario: {e}")
    for name, out in outputs.items():
        print(f"--- {name}\n{out.rstrip()}")
    print("REPRODUCED" if reproduced else "NOT REPRODUCED (outputs are identical)")
    preserved = outputs.get("worsened", outputs["baseline"]) == outputs["baseline"]
    if "worsened" in outputs:
        print("worsenings preserve behaviour" if preserved else "WORSENINGS CHANGE BEHAVIOUR (they must not)")
    sys.exit(0 if reproduced and preserved else 1)


if __name__ == "__main__":
    main()
