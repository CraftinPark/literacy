"""The frontend copy of the examples must never contain grading content."""
import importlib.util
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("sync_public", ROOT / "tools" / "sync_public.py")
sp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sp)


def test_only_public_files_are_copied(tmp_path):
    out = tmp_path / "out"
    index = sp.sync(ROOT / "examples", out)
    ids = [e["id"] for e in index]
    assert ids == sorted(p.name for p in (ROOT / "examples").iterdir() if (p / "public.json").is_file())
    files = {p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()}
    expected = {"index.json"}
    for ex in ids:
        pub = json.loads((ROOT / "examples" / ex / "public.json").read_text())
        expected |= {f"{ex}/public.json", *(f"{ex}/code/{f['path']}" for f in pub["files"])}
    assert files == expected  # nothing else (no key.json, manifest.json, internal/)


def test_key_content_never_reaches_the_frontend(tmp_path):
    out = tmp_path / "out"
    sp.sync(ROOT / "examples", out)
    blob = "".join(p.read_text() for p in out.rglob("*.json"))
    for ex in (ROOT / "examples").iterdir():
        key = json.loads((ex / "key.json").read_text())
        for b in key["bugs"]:
            assert b["description"] not in blob and b["fix"] not in blob
        for r in key["rubric"]:
            assert r["point"] not in blob


def test_stray_files_in_code_are_not_copied(tmp_path):
    examples = tmp_path / "examples"
    shutil.copytree(ROOT / "examples" / "readcode-002", examples / "readcode-002")
    (examples / "readcode-002" / "code" / "answers.txt").write_text("B1 is in processJob")
    out = tmp_path / "out"
    sp.sync(examples, out)
    assert not (out / "readcode-002" / "code" / "answers.txt").exists()
