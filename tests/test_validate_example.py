"""Tamper tests for tools/validate_example.py.

Each test copies examples/readcode-001 into a temp dir, breaks it one way,
and checks that the validator rejects it with the expected message.
"""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "readcode-001"

_spec = importlib.util.spec_from_file_location("validate_example", ROOT / "tools" / "validate_example.py")
ve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ve)


@pytest.fixture(scope="module")
def validators():
    return ve.load_schemas(ROOT / "schemas")


@pytest.fixture
def ex(tmp_path):
    dst = tmp_path / "readcode-001"
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
    code = ex / "code" / "lru_cache.c"
    code.write_text(code.read_text().replace("evict_tail", "evict_last", 1))
    assert "sha256 mismatch" in errors(ex, validators)


def test_bad_weights_are_rejected(ex, validators):
    key = load(ex, "key")
    key["bugs"][0]["weight"] += 1
    save(ex, "key", key)
    assert "bugs: item weights sum to" in errors(ex, validators)


def test_unknown_question_id_is_rejected(ex, validators):
    key = load(ex, "key")
    key["comprehension"][0]["question_id"] = "C99"
    save(ex, "key", key)
    assert "but key scores" in errors(ex, validators)


def test_range_outside_file_is_rejected(ex, validators):
    key = load(ex, "key")
    key["bugs"][0]["locations"][0]["end_line"] = 9999
    save(ex, "key", key)
    assert "are outside lru_cache.c" in errors(ex, validators)


def test_approval_without_rubric_or_pilot_is_rejected(ex, validators):
    man = load(ex, "manifest")
    man["review"] = {"status": "approved", "reviewer": "x", "reviewed_at": "2026-01-01T00:00:00Z"}
    save(ex, "manifest", man)
    assert "'rubric' is a required property" in errors(ex, validators)


def test_approval_with_undetected_bug_is_rejected(ex, validators):
    man = load(ex, "manifest")
    man["review"] = {"status": "approved", "reviewer": "x", "reviewed_at": "2026-01-01T00:00:00Z"}
    man["rubric"] = {"version": 1, "citations_valid": True}
    man["pilot_solve"] = {"model": "m", "score": 80, "found_bug_ids": [], "unlisted_findings": []}
    man["bugs"][0]["gate_b"].update(detected=False, detected_by="none")
    save(ex, "manifest", man)
    assert "never detected by a check" in errors(ex, validators)


def test_leaked_key_field_is_rejected(ex, validators):
    pub = load(ex, "public")
    pub["questions"][0]["key_points"] = ["anything"]
    save(ex, "public", pub)
    # the public schema forbids extra fields, so this is caught at layer 1
    assert "key_points" in errors(ex, validators)


def test_leaked_key_point_text_is_rejected(ex, validators):
    pub, key = load(ex, "public"), load(ex, "key")
    pub["questions"][0]["text"] += " Hint: " + key["comprehension"][0]["key_points"][0]
    save(ex, "public", pub)
    assert "answer key point verbatim" in errors(ex, validators)


def test_missing_shipped_list_is_rejected(ex, validators):
    man = load(ex, "manifest")
    del man["shipped"]
    save(ex, "manifest", man)
    assert "'shipped' is a required property" in errors(ex, validators)
