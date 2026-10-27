"""Command line for fix-and-quiz exercises. Run from backend/.

    python -m fixquiz build ../examples/readcode-004
    python -m fixquiz grade ../examples/readcode-004 --code DIR [--answers answers.json] [--out report.html]
    python -m fixquiz api ACTION --example DIR --workdir DIR    (JSON request on stdin, JSON reply on stdout)

`api` is what the frontend's dev server calls; ACTION is run or complete. Both take
{"files": {path: text}} with the candidate's edited files; complete also takes answers, candidate, timings.
"""
import argparse
import json
import sys
from pathlib import Path

from . import report, session
from .build import build
from .grade import code_diff, grade, load


def api(action, example, workdir, request):
    files = request.get("files") or {}
    if not isinstance(files, dict):
        raise ValueError("files must be an object of path -> text")
    if action == "run":
        return session.run_visible(example, files)
    if action == "complete":
        answers = request.get("answers") or {}
        if not isinstance(answers, dict):
            raise ValueError("answers must be an object of question id -> option id")
        return session.complete(example, workdir, files, answers, str(request.get("candidate") or "")[:120],
                                request.get("timings") or {})
    raise ValueError(f"unknown action '{action}'")


def main():
    ap = argparse.ArgumentParser(prog="python -m fixquiz", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="regenerate code/ and the manifest from the baseline")
    b.add_argument("example", type=Path)
    g = sub.add_parser("grade", help="grade a code folder (and optional quiz answers) without the web page")
    g.add_argument("example", type=Path)
    g.add_argument("--code", type=Path, required=True)
    g.add_argument("--answers", type=Path, help='JSON file like {"Q1": "b", ...}')
    g.add_argument("--out", type=Path, help="write the HTML report here")
    a = sub.add_parser("api")
    a.add_argument("action")
    a.add_argument("--example", type=Path, required=True)
    a.add_argument("--workdir", type=Path, required=True)
    args = ap.parse_args()

    if args.cmd == "build":
        print(build(args.example))
    elif args.cmd == "grade":
        answers = json.loads(args.answers.read_text(encoding="utf-8")) if args.answers else {}
        graded = grade(args.example, args.code, answers)
        if args.out:
            pub, key = load(args.example)
            args.out.write_text(report.render(pub, key, graded, code_diff(args.example, args.code)), encoding="utf-8")
        print(json.dumps(graded["score"], indent=2))
    else:
        try:
            raw = sys.stdin.read()
            reply = api(args.action, args.example, args.workdir, json.loads(raw) if raw.strip() else {})
        except (ValueError, FileNotFoundError, OSError) as e:
            print(json.dumps({"error": str(e)}))
            sys.exit(1)
        print(json.dumps(reply))


if __name__ == "__main__":
    main()
