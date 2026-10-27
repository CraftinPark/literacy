"""Render a graded attempt as one self-contained HTML file (no scripts, no external assets)."""
import re
from datetime import datetime
from html import escape

CSS = """
:root { --ink:#1B2430; --muted:#556274; --line:#D5DCE5; --canvas:#F3F5F8; --panel:#FFFFFF; --chip:#EEF1F5;
        --accent:#1F4FD8; --ok:#1B7F4B; --ok-soft:#E5F3EC; --bad:#B42318; --bad-soft:#FBEAE8; --code:#0E1621; --code-text:#D7E0EA; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--canvas); color: var(--ink); font: 14px/1.5 "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 920px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 22px; margin: 2px 0 4px; } h2 { font-size: 17px; margin: 36px 0 12px; } h3 { font-size: 15px; margin: 22px 0 8px; }
.label { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); }
.muted { color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 20px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.big { font-size: 28px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
th, td { text-align: left; padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; }
th { background: var(--chip); border-top: 0; font-size: 12px; color: var(--muted); font-weight: 600; }
td.num, th.num { text-align: right; white-space: nowrap; }
code, pre, .mono { font-family: "IBM Plex Mono", ui-monospace, Consolas, monospace; font-size: 12.5px; }
code { background: var(--chip); padding: 1px 5px; border-radius: 4px; }
.chip { display: inline-block; font-size: 11.5px; padding: 1px 7px; border-radius: 999px; background: var(--chip); color: var(--muted); white-space: nowrap; }
.pass { color: var(--ok); font-weight: 600; } .fail { color: var(--bad); font-weight: 600; }
.msg { margin-top: 4px; color: var(--bad); white-space: pre-wrap; word-break: break-word; }
.note { margin-top: 4px; color: var(--muted); font-size: 12.5px; }
.key { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin-top: 10px; }
.key p { margin: 6px 0; }
details > summary { cursor: pointer; font-weight: 600; }
pre.diff { background: var(--code); color: var(--code-text); padding: 12px 14px; border-radius: 8px; overflow-x: auto; line-height: 1.45; margin: 8px 0 0; }
.add { color: #8FD694; } .del { color: #FF9C93; } .hunk { color: #7DB7FF; }
.q { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-top: 12px; }
.q-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.opts { list-style: none; padding: 0; margin: 10px 0 0; }
.opts li { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-top: 6px; }
.opts li.right { border-color: var(--ok); background: var(--ok-soft); }
.opts li.wrong { border-color: var(--bad); background: var(--bad-soft); }
.why { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
footer { margin-top: 40px; font-size: 12.5px; color: var(--muted); }
@media print { body { background: #fff; } details { break-inside: avoid; } details:not([open]) > *:not(summary) { display: block; } }
"""


def inline(text):
    """Escape text and turn `backticks` into <code>."""
    parts = re.split(r"`([^`]+)`", text)
    return "".join(f"<code>{escape(p)}</code>" if i % 2 else escape(p) for i, p in enumerate(parts))


def paragraphs(text):
    return "".join(f"<p>{inline(p)}</p>" for p in text.split("\n\n") if p.strip())


def clock(ms):
    if ms is None or ms < 0:
        return "–"
    s = round(ms / 1000)
    return f"{s // 60}:{s % 60:02d}"


def section_time(start, end, minutes):
    if not start or not end:
        return "–"
    spent = end - start
    over = spent - minutes * 60_000
    text = f"{clock(spent)} of {minutes}:00"
    return text + (f' <span class="fail">(+{clock(over)} over)</span>' if over > 0 else "")


def diff_html(text):
    out = []
    for line in text.splitlines():
        cls = "hunk" if line.startswith("@@") else "add" if line.startswith("+") and not line.startswith("+++") \
            else "del" if line.startswith("-") and not line.startswith("---") else ""
        out.append(f'<span class="{cls}">{escape(line)}</span>' if cls else escape(line))
    return "\n".join(out)


def render(pub, key, graded, diff, candidate="", timings=None, generated_at=None):
    t = timings or {}
    s = graded["score"]
    when = (generated_at or datetime.now().astimezone()).strftime("%Y-%m-%d %H:%M %Z").strip()
    tickets = {tk["id"]: tk for tk in pub["fix"]["tickets"]}
    key_tickets = {tk["id"]: tk for tk in key["tickets"]}
    h = []
    h.append(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report: {escape(pub['title'])}</title><style>{CSS}</style></head><body><main>
<div class="label">ReadCode report</div>
<h1>{escape(pub['title'])}</h1>
<div class="muted">Exercise {escape(pub['id'].replace('readcode-', ''))} · version {pub['version']}
 · candidate: <b>{escape(candidate.strip() or 'not given')}</b> · completed {escape(when)}</div>
<div class="cards">
  <div class="card"><div class="muted">Total</div><div class="big">{s['total']:g} / {s['max']:g}</div></div>
  <div class="card"><div class="muted">Section 1 · Fix</div><div class="big">{s['fix']:g} / {s['fix_max']:g}</div>
    <div class="muted">{s['tests_passed']} of {s['tests_total']} tests pass</div></div>
  <div class="card"><div class="muted">Section 2 · Quiz</div><div class="big">{s['quiz']:g} / {s['quiz_max']:g}</div>
    <div class="muted">{s['quiz_correct']} of {s['quiz_total']} correct</div></div>
</div>
<h2>Time</h2>
<table><tr><th>Section</th><th>Time spent</th></tr>
<tr><td>1 · Fix</td><td>{section_time(t.get('fix_started_at'), t.get('quiz_started_at'), pub['fix']['minutes'])}</td></tr>
<tr><td>2 · Quiz</td><td>{section_time(t.get('quiz_started_at'), t.get('completed_at'), pub['quiz']['minutes'])}</td></tr>
</table>
<p class="muted">Timers are a guide only: nothing was cut off.</p>""")

    h.append("<h2>Section 1 · Fix</h2>")
    for tid, tk in tickets.items():
        rows = [r for r in graded["tests"] if r["ticket"] == tid]
        earned, total = sum(r["earned"] for r in rows), sum(r["points"] for r in rows)
        h.append(f"<h3>Ticket {escape(tid)} · {escape(tk['title'])} <span class='muted'>· {earned:g} / {total:g}</span></h3>")
        h.append('<table><tr><th>Test</th><th>Kind</th><th>Result</th><th class="num">Points</th></tr>')
        for r in rows:
            name = r["nodeid"].split("::")[-1]
            kind = f'<span class="chip">{r["visibility"]}</span> <span class="chip">{"bug" if r["role"] == "failing" else "regression"}</span>'
            result = '<span class="pass">pass</span>' if r["passed"] else '<span class="fail">fail</span>'
            detail = f'<div class="msg mono">{escape(r["message"])}</div>' if r["message"] and not r["passed"] else ""
            note = f'<div class="note">{escape(r["note"])}</div>' if r.get("note") else ""
            h.append(f'<tr><td><span class="mono">{escape(r["id"])} {escape(name)}</span>'
                     f'<div class="note">{escape(r["checks"])}</div>{detail}{note}</td>'
                     f'<td>{kind}</td><td>{result}</td><td class="num">{r["earned"]:g} / {r["points"]:g}</td></tr>')
        h.append("</table>")
        kt = key_tickets.get(tid)
        if kt:
            wrong = "".join(f"<li>{escape(w)}</li>" for w in kt.get("wrong_fixes", []))
            h.append(f"""<details class="key"><summary>Answer key for ticket {escape(tid)}</summary>
<p><b>Cause.</b> {escape(kt['root_cause'])}</p><p><b>Fix.</b> {escape(kt['fix'])}</p>
{f'<p><b>Plausible wrong fixes.</b></p><ul>{wrong}</ul>' if wrong else ''}</details>""")
    h.append(f"<p class='muted'>{escape(key['scoring'].get('rule', ''))}</p>")

    h.append("<h2>Code changes</h2>")
    if not diff:
        h.append("<p class='muted'>No changes: the code is as shipped.</p>")
    for d in diff:
        h.append(f"<details open><summary class='mono'>{escape(d['path'])} <span class='chip'>{d['status']}</span></summary>"
                 f"<pre class='diff'>{diff_html(d['diff'])}</pre></details>")

    h.append("<h2>Section 2 · Quiz</h2>")
    for i, q in enumerate(graded["quiz"], 1):
        mark = '<span class="pass">correct</span>' if q["correct"] else \
            ('<span class="fail">wrong</span>' if q["picked"] else '<span class="fail">not answered</span>')
        h.append(f'<div class="q"><div class="q-head"><b>Question {i}</b><span>{mark} · {q["earned"]:g} / {q["points"]:g}</span></div>'
                 f'<div>{inline(q["text"])}</div><ul class="opts">')
        for o in q["options"]:
            cls = "right" if o["id"] == q["answer"] else "wrong" if o["id"] == q["picked"] else ""
            tags = []
            if o["id"] == q["picked"]:
                tags.append("candidate's answer")
            if o["id"] == q["answer"]:
                tags.append("correct answer")
            why = q["explanations"].get(o["id"]) if o["id"] in (q["picked"], q["answer"]) else None
            h.append(f'<li class="{cls}">{inline(o["text"])}'
                     f'{"".join(f" <span class=chip>{escape(x)}</span>" for x in tags)}'
                     f'{f"<div class=why>{escape(why)}</div>" if why else ""}</li>')
        h.append("</ul></div>")

    h.append("""<footer>Generated by ReadCode. This report contains the answer key: share it with the
interviewer or reviewer, not with someone who has yet to take the exercise.</footer></main></body></html>""")
    return "\n".join(h)
