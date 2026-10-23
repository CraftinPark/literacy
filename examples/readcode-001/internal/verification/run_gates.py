#!/usr/bin/env python3
"""Run gate A (clean baseline passes every test) and gate B (each seeded bug is caught by its test).

Usage: python3 run_gates.py <example_dir>
Writes internal/evidence/*.txt and internal/evidence/results.json.
"""
import json, subprocess, sys, os, re

ex = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
ver = os.path.join(ex, "internal", "verification")
evd = os.path.join(ex, "internal", "evidence")
BUGS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10"]
FLAGS = ["-std=gnu11", "-O1", "-g", "-fno-omit-frame-pointer", "-fsanitize=address,undefined",
         "-fno-sanitize-recover=all", "-w", "-pthread"]
ENV = dict(os.environ, ASAN_OPTIONS="detect_leaks=0")   # leaks are counted by the driver's allocator hooks

def build(unit, out):
    cmd = ["gcc"] + FLAGS + [f'-DUNIT="{unit}"', os.path.join(ver, "driver.c"), "-o", out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit("build failed:\n" + r.stderr)

def run(binary, test):
    try:
        r = subprocess.run([binary, test], capture_output=True, text=True, timeout=20, env=ENV)
    except subprocess.TimeoutExpired:
        return "TIMEOUT", "test did not finish within 20s (possible hang)"
    err = (r.stderr or "").strip()
    if r.returncode == 0 and r.stdout.strip() == "PASS":
        return "PASS", ""
    if "AddressSanitizer" in err:
        m = re.search(r"ERROR: AddressSanitizer: ([\w-]+)", err)
        return "asan", "AddressSanitizer: " + (m.group(1) if m else "error") + "\n" + "\n".join(err.splitlines()[:14])
    if "runtime error" in err:
        return "ubsan", "\n".join(l for l in err.splitlines() if "runtime error" in l)[:600]
    if r.returncode < 0:
        return "test-driver", f"terminated by signal {-r.returncode}\n{err[:400]}"
    return "test-driver", err[:600]

shipped, base = os.path.join(ex, "code", "lru_cache.c"), os.path.join(ex, "internal", "baseline", "lru_cache.c")
build(base, "/tmp/rc001_base"); build(shipped, "/tmp/rc001_ship")

res = {"gate_a": {}, "gate_b": {}}
a_lines, tests_ok = [], 0
for t in ["t0"] + BUGS:
    v, _ = run("/tmp/rc001_base", t)
    a_lines.append(f"baseline {t}: {v}"); tests_ok += v == "PASS"
res["gate_a"] = {"passed": tests_ok == len(BUGS) + 1, "tests_run": len(BUGS) + 1}
open(os.path.join(evd, "gate_a.txt"), "w").write(
    "Gate A: clean baseline must pass every test under ASan+UBSan.\n" + "\n".join(a_lines) + "\n")

v0, _ = run("/tmp/rc001_ship", "t0")
for b in BUGS:
    vb, _ = run("/tmp/rc001_base", b)                 # test must pass on the clean baseline...
    vs, detail = run("/tmp/rc001_ship", b)            # ...and fail on the shipped (bugged) code
    caught = vb == "PASS" and vs != "PASS"
    res["gate_b"][b] = {"detected": caught, "detected_by": vs if caught else "none"}
    open(os.path.join(evd, f"{b}.txt"), "w").write(
        f"Gate B for {b}\nclean baseline test result : {vb}\nshipped (bugged) result   : {vs}\n"
        f"sanity t0 on shipped code : {v0} (ordinary behaviour still works)\n\n{detail.replace(ex, '<example>')}\n")
json.dump(res, open(os.path.join(evd, "results.json"), "w"), indent=2)
print(json.dumps(res, indent=1))
