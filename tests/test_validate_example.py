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


# ---- fix_quiz format (examples/readcode-004)

@pytest.fixture
def fq(tmp_path):
    dst = tmp_path / "readcode-004"
    shutil.copytree(ROOT / "examples" / "readcode-004", dst, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    return dst


def test_fix_quiz_example_passes(fq, validators):
    rep = ve.validate(str(fq), validators)
    assert rep.errors == [] and rep.warnings == []


def test_fix_quiz_edited_baseline_is_rejected(fq, validators):
    p = fq / "internal" / "baseline" / "tally" / "ledger.py"
    p.write_text(p.read_text() + "\n")
    assert "sha256 does not match the baseline folder" in errors(fq, validators)


def test_fix_quiz_answer_must_be_an_option(fq, validators):
    key = load(fq, "key")
    key["quiz"][0]["answer"] = "e"
    save(fq, "key", key)
    assert "is not one of the options" in errors(fq, validators)


def test_fix_quiz_points_must_add_up(fq, validators):
    key = load(fq, "key")
    key["tests"][0]["points"] += 1
    save(fq, "key", key)
    assert "fix: item points sum to" in errors(fq, validators)


def test_fix_quiz_visible_tests_must_match_the_key(fq, validators):
    pub = load(fq, "public")
    pub["fix"]["visible_tests"].pop()
    save(fq, "public", pub)
    assert "visible_tests" in errors(fq, validators)


def test_fix_quiz_hidden_test_must_exist(fq, validators):
    (fq / "internal" / "hidden_tests" / "test_hidden.py").unlink()
    assert "internal/hidden_tests/test_hidden.py does not exist" in errors(fq, validators).replace("\\", "/")


def test_fix_quiz_naming_a_hidden_test_is_a_leak(fq, validators):
    pub, key = load(fq, "public"), load(fq, "key")
    hidden = next(t for t in key["tests"] if t["visibility"] == "hidden")
    pub["fix"]["intro"] += " See " + hidden["nodeid"].split("::")[1]
    save(fq, "public", pub)
    assert "names the hidden test" in errors(fq, validators)


def test_fix_quiz_leaked_explanation_is_rejected(fq, validators):
    pub, key = load(fq, "public"), load(fq, "key")
    pub["quiz"]["questions"][0]["text"] += " " + key["quiz"][0]["explanations"]["b"]
    save(fq, "public", pub)
    assert "answer-key text verbatim" in errors(fq, validators)


def test_fix_quiz_approval_needs_every_fix_check_to_pass(fq, validators):
    man = load(fq, "manifest")
    man["review"] = {"status": "approved", "reviewer": "x", "reviewed_at": "2026-01-01T00:00:00Z"}
    man["rubric"] = {"version": 1, "citations_valid": True}
    man["pilot_solve"] = {"model": "m", "score": 90, "found_bug_ids": [], "unlisted_findings": []}
    man["fix_checks"][0]["passed"] = False
    save(fq, "manifest", man)
    assert "fix checks did not behave as expected" in errors(fq, validators)
