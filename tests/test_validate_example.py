"""Tamper tests for tools/validate_example.py.

Each test copies examples/readcode-002 into a temp dir, breaks it one way,
and checks that the validator rejects it with the expected message.
"""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "readcode-002"

_spec = importlib.util.spec_from_file_location("validate_example", ROOT / "tools" / "validate_example.py")
ve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ve)


@pytest.fixture(scope="module")
def validators():
    return ve.load_schemas(ROOT / "schemas")


@pytest.fixture
def ex(tmp_path):
    dst = tmp_path / "readcode-002"
    shutil.copytree(EXAMPLE, dst)
    return dst


def load(ex, name):
    return json.loads((ex / f"{name}.json").read_text())


def save(ex, name, doc):
    (ex / f"{name}.json").write_text(json.dumps(doc, indent=2))


def errors(ex, validators):
    return "\n".join(ve.validate(str(ex), validators).errors)


def test_clean_example_passes(ex, validators):
    rep = ve.validate(str(ex), validators)
    assert rep.errors == []


def test_edited_code_is_rejected(ex, validators):
    code = ex / "code" / "worker.ts"
    code.write_text(code.read_text().replace("mainLoop", "mainLoop2", 1))
    assert "sha256 mismatch" in errors(ex, validators)


def test_edited_baseline_is_rejected(ex, validators):
    base = ex / "internal" / "baseline" / "lock-manager.ts"
    base.write_text(base.read_text() + "\n")
    assert "lock-manager.ts was modified after the compile check ran" in errors(ex, validators)


def test_unrecorded_difference_is_rejected(ex, validators):
    # Change shipped code and re-pin its hash, as if someone hand-edited code/ and reran the compile check.
    code = ex / "code" / "lock-manager.ts"
    code.write_text(code.read_text().replace("lockRenewTime / 2 < now", "lockRenewTime < now"))
    man = load(ex, "manifest")
    for f in man["shipped"]["files"]:
        if f["path"] == "lock-manager.ts":
            f["sha256"] = ve.sha256(code)
    save(ex, "manifest", man)
    assert "differs from the baseline by more than the recorded bugs" in errors(ex, validators)


def test_bug_change_not_at_recorded_line_is_rejected(ex, validators):
    man = load(ex, "manifest")
    man["bugs"][0]["line"] += 1
    save(ex, "manifest", man)
    assert "does not match the recorded change" in errors(ex, validators)


def test_bug_outside_key_location_is_rejected(ex, validators):
    key = load(ex, "key")
    key["bugs"][0]["locations"][0].update(start_line=10, end_line=20)
    save(ex, "key", key)
    assert "is not inside any location the key gives" in errors(ex, validators)


def test_range_outside_file_is_rejected(ex, validators):
    key = load(ex, "key")
    key["bugs"][0]["locations"].append({"file": "worker.ts", "start_line": 1, "end_line": 9999})
    save(ex, "key", key)
    assert "are outside worker.ts" in errors(ex, validators)


def test_rubric_for_unknown_question_is_rejected(ex, validators):
    key = load(ex, "key")
    key["rubric"][0]["question_id"] = "Q99"
    save(ex, "key", key)
    assert "unknown question Q99" in errors(ex, validators)


def test_question_without_required_point_is_rejected(ex, validators):
    key = load(ex, "key")
    key["rubric"] = [r for r in key["rubric"] if r["question_id"] != "Q6"]
    save(ex, "key", key)
    assert "question Q6 has no required rubric point" in errors(ex, validators)


def test_bug_without_required_point_is_rejected(ex, validators):
    key = load(ex, "key")
    for r in key["rubric"]:
        r.pop("bug_id", None)
    save(ex, "key", key)
    assert "bug B1 has no required rubric point" in errors(ex, validators)


def test_approval_without_compile_pass_is_rejected(ex, validators):
    man = load(ex, "manifest")
    man["review"] = {"status": "approved", "reviewer": "x", "reviewed_at": "2026-01-01T00:00:00Z"}
    man["shipped"]["compile_check"]["passed"] = False
    save(ex, "manifest", man)
    assert "True was expected" in errors(ex, validators)


def test_missing_evidence_is_rejected(ex, validators):
    (ex / "internal" / "evidence" / "compile_shipped.txt").unlink()
    assert "evidence file internal/evidence/compile_shipped.txt is missing" in errors(ex, validators)


def test_leaked_key_field_is_rejected(ex, validators):
    pub = load(ex, "public")
    pub["questions"][0]["point"] = "anything"
    save(ex, "public", pub)
    # the public schema forbids extra fields, so this is caught at layer 1
    assert "point" in errors(ex, validators)


def test_leaked_rubric_text_is_rejected(ex, validators):
    pub, key = load(ex, "public"), load(ex, "key")
    pub["intro"] += " " + key["rubric"][8]["point"]
    save(ex, "public", pub)
    assert "contains rubric point R9 verbatim" in errors(ex, validators)


def test_bad_concept_id_is_rejected(ex, validators):
    man = load(ex, "manifest")
    man["tests"] = ["queues-consumers"]
    save(ex, "manifest", man)
    assert "does not match" in errors(ex, validators)


def test_concepts_must_match_the_manifest(ex, validators):
    pub = load(ex, "public")
    pub["concepts"] = [c for c in pub["concepts"] if c["id"] != "backend.resilience.rate-limiting"]
    save(ex, "public", pub)
    assert "public shows" in errors(ex, validators)
