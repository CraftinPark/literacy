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
    assert [(e["id"], e["format"]) for e in index] == [("readcode-001", "review"), ("readcode-004", "fix_quiz")]
    files = sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file())
    pub4 = json.loads((ROOT / "examples" / "readcode-004" / "public.json").read_text())
    assert files == sorted(["index.json", "readcode-001/code/lru_cache.c", "readcode-001/public.json",
                            "readcode-004/public.json"] + [f"readcode-004/code/{f['path']}" for f in pub4["files"]])


def test_key_content_never_reaches_the_frontend(tmp_path):
    out = tmp_path / "out"
    sp.sync(ROOT / "examples", out)
    key = json.loads((ROOT / "examples" / "readcode-001" / "key.json").read_text())
    blob = "".join(p.read_text() for p in out.rglob("*.json"))
    for b in key["bugs"]:
        assert b["description"] not in blob and b["fix"] not in blob


def test_stray_files_in_code_are_not_copied(tmp_path):
    examples = tmp_path / "examples"
    shutil.copytree(ROOT / "examples" / "readcode-001", examples / "readcode-001")
    (examples / "readcode-001" / "code" / "answers.txt").write_text("B1 is in evict_tail")
    out = tmp_path / "out"
    sp.sync(examples, out)
    assert not (out / "readcode-001" / "code" / "answers.txt").exists()


def test_fix_quiz_answers_and_hidden_tests_never_reach_the_frontend(tmp_path):
    out = tmp_path / "out"
    sp.sync(ROOT / "examples", out)
    key = json.loads((ROOT / "examples" / "readcode-004" / "key.json").read_text())
    blob = "".join(p.read_text(encoding="utf-8") for p in (out / "readcode-004").rglob("*") if p.is_file())
    assert '"answer"' not in blob and "explanations" not in blob
    for t in key["tests"]:
        if t["visibility"] == "hidden":
            assert t["nodeid"].split("::")[1] not in blob
    for tk in key["tickets"]:
        assert tk["root_cause"] not in blob and tk["fix"] not in blob
