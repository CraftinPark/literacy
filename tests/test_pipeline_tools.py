"""tools/inject_bugs.py and tools/compile_check.py: they must pass on the real example
and fail when they should."""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "readcode-002"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ib, cc = _load("inject_bugs"), _load("compile_check")
needs_tsc = pytest.mark.skipif(not cc.TSC.exists(), reason="run `npm install` in tools/ts")


@pytest.fixture
def ex(tmp_path):
    dst = tmp_path / "readcode-002"
    shutil.copytree(EXAMPLE, dst)
    return dst


def test_inject_reproduces_the_shipped_code(ex):
    shutil.rmtree(ex / "code")
    placed = ib.inject(ex)
    assert placed == {"B1": ("worker.ts", 334)}
    for f in (EXAMPLE / "code").iterdir():
        assert (ex / "code" / f.name).read_text() == f.read_text()


def test_inject_rejects_ambiguous_change(ex):
    man = json.loads((ex / "manifest.json").read_text())
    man["bugs"][0]["change"]["old"] = "this.lockManager.untrackJob(job.id);"   # occurs several times
    (ex / "manifest.json").write_text(json.dumps(man))
    with pytest.raises(ib.InjectError, match="occurs 4 times"):
        ib.inject(ex)


@needs_tsc
def test_compile_check_passes_and_writes_evidence(ex):
    results = cc.run(ex)
    assert {k: v[0] for k, v in results.items()} == {"baseline": True, "shipped": True}
    ev = (ex / "internal" / "evidence" / "compile_shipped.txt").read_text()
    assert "result: PASS" in ev and str(ex) not in ev


@needs_tsc
def test_compile_check_fails_on_a_type_error(ex):
    code = ex / "code" / "worker.ts"
    code.write_text(code.read_text().replace("this.lockManager.trackJob(", "this.lockManager.trackJobs(", 1))
    results = cc.run(ex)
    assert results["baseline"][0] is True
    assert results["shipped"][0] is False and "trackJobs" in results["shipped"][1]
    man = json.loads((ex / "manifest.json").read_text())
    assert man["shipped"]["compile_check"]["passed"] is False
    assert "result: FAIL" in (ex / "internal" / "evidence" / "compile_shipped.txt").read_text()
