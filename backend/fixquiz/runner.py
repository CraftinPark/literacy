"""Run an example's tests against a code tree, the way the grader sees it.

The tree being graded supplies only the code. Tests and pytest configuration
always come from the example (code/tests/, plus the hidden tests from
internal/ when asked), so editing or deleting a test in a workspace changes
nothing. Each run happens in a fresh temporary folder.
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

SKIP_DIRS = {"__pycache__", ".pytest_cache", ".venv", ".git", ".idea", ".vscode"}
SKIP_SUFFIXES = (".pyc", ".db")
# Files that change how pytest runs: always taken from the example, never from the tree.
CONFIG_NAMES = {"conftest.py", "pytest.ini", "setup.cfg", "tox.ini", "pyproject.toml"}
RUN_TIMEOUT = 60
SINGLE_TIMEOUT = 15


def tree_files(root):
    """Every file under root as a sorted list of relative, forward-slash paths (caches skipped)."""
    out = []
    for d, dirs, names in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        rel = os.path.relpath(d, root)
        out += [os.path.normpath(os.path.join(rel, n)).replace(os.sep, "/")
                for n in names if not n.endswith(SKIP_SUFFIXES)]
    return sorted(out)


def sha256_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def tree_sha256(root):
    """sha256 over the sorted `<file sha256>  <path>` lines of a tree."""
    lines = "".join(f"{sha256_file(os.path.join(root, p))}  {p}\n" for p in tree_files(root))
    return hashlib.sha256(lines.encode()).hexdigest()


def copy_tree(src, dst):
    """Copy a tree, leaving out caches and virtualenvs."""
    for rel in tree_files(src):
        target = Path(dst, rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(Path(src, rel), target)


def is_test_or_config(rel):
    return rel.startswith("tests/") or rel.rsplit("/", 1)[-1] in CONFIG_NAMES


def prepare(example, tree, dest, hidden_dir=None):
    """Lay out `tree`'s code with the example's own tests in `dest`."""
    pristine = Path(example, "code")
    for rel in tree_files(tree):
        if not is_test_or_config(rel):
            target = Path(dest, rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(tree, rel), target)
    for rel in tree_files(pristine):
        if is_test_or_config(rel):
            target = Path(dest, rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(pristine, rel), target)
    if hidden_dir:
        for rel in tree_files(hidden_dir):
            target = Path(dest, "tests", rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(hidden_dir, rel), target)


def _first_lines(text, n=3, limit=400):
    text = "\n".join((text or "").strip().splitlines()[:n])
    return text if len(text) <= limit else text[:limit - 1] + "…"


def _pytest(cwd, args, timeout):
    """Run pytest once; return ({nodeid: (passed, message)}, {test file: error}, output tail)."""
    xml = Path(cwd, ".junit.xml")
    if xml.exists():
        xml.unlink()
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    env.pop("PYTHONPATH", None)
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--junitxml", str(xml), *args],
        cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout,
    )
    tail = _first_lines("\n".join(proc.stdout.strip().splitlines()[-6:]), n=6)
    results, module_errors = {}, {}
    if not xml.exists():
        return results, module_errors, tail
    for case in ET.parse(xml).getroot().iter("testcase"):
        cls, name = case.get("classname", ""), case.get("name", "")
        problem = case.find("failure")
        if problem is None:
            problem = case.find("error")
        if not cls:  # a test module that could not be collected (import error, syntax error)
            module_errors[name.replace(".", "/") + ".py"] = _first_lines(problem.get("message") if problem is not None else "")
            continue
        nodeid = cls.replace(".", "/") + ".py::" + name
        if problem is not None:
            results[nodeid] = (False, _first_lines(problem.get("message") or problem.text))
        elif case.find("skipped") is not None:
            results[nodeid] = (False, "skipped")
        else:
            results[nodeid] = (True, "")
    return results, module_errors, tail


def run_tests(example, tree, nodeids, hidden_dir=None):
    """Run the given tests against `tree`. Returns {nodeid: {"passed": bool, "message": str}}.

    A test that did not run (its module failed to import, pytest crashed, or it
    timed out) counts as failed, with the reason as its message.
    """
    with tempfile.TemporaryDirectory(prefix="fixquiz-") as tmp:
        prepare(example, tree, tmp, hidden_dir)
        try:
            results, module_errors, tail = _pytest(tmp, ["tests"], RUN_TIMEOUT)
        except subprocess.TimeoutExpired:
            # Something hangs: run the tests one by one so only the guilty ones fail.
            results, module_errors, tail = {}, {}, ""
            for nodeid in nodeids:
                try:
                    one, errs, _ = _pytest(tmp, [nodeid], SINGLE_TIMEOUT)
                    results.update(one)
                    module_errors.update(errs)
                except subprocess.TimeoutExpired:
                    results[nodeid] = (False, f"timed out after {SINGLE_TIMEOUT} s")
        out = {}
        for nodeid in nodeids:
            if nodeid in results:
                passed, message = results[nodeid]
            else:
                module = nodeid.split("::")[0]
                passed = False
                message = (f"did not run: the test file failed to load: {module_errors[module]}" if module in module_errors
                           else f"did not run: {tail or 'pytest produced no result'}")
            out[nodeid] = {"passed": passed, "message": message.replace(tmp, "<tree>")}
        return out
