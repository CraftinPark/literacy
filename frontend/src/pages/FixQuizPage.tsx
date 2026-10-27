// Fix-and-quiz exercise, all in the browser:
// intro -> Section 1 (built-in editor + tickets + provided tests) -> Next (edits are frozen, the editor
// becomes read-only) -> Section 2 (multiple choice, code still readable) -> Complete (all tests incl. hidden
// ones + quiz graded in Python; the HTML report is downloaded).
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'
import { CodeEditor } from '../exercise/CodeEditor'
import { Timer } from '../exercise/Header'
import { clearExam, downloadHtml, emptyExam, examCall, fileTree, isLocked, loadExam, saveExam, testName } from '../lib/fixquiz'
import type { ExamResult, ExamState, FixQuizExercise, RunResult, Score, TreeNode } from '../lib/fixquiz'

const btnPrimary = 'h-9 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-[#1a44bd] disabled:cursor-not-allowed disabled:opacity-60'
const btnSecondary = 'h-9 rounded-lg border border-line-strong bg-white px-3.5 font-medium hover:border-ink disabled:cursor-not-allowed disabled:opacity-60'
const card = 'rounded-[10px] border border-line bg-white'

export default function FixQuizPage({ id }: { id: string }) {
  const [ex, setEx] = useState<FixQuizExercise | null>(null)
  const [originals, setOriginals] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/exercises/${id}/public.json`)
        if (!res.ok) throw new Error(`Exercise ${id} was not found. Run \`npm run sync\`.`)
        const pub = await res.json()
        if (pub.format !== 'fix_quiz') throw new Error(`Exercise ${id} is not a fix-and-quiz exercise.`)
        const texts = await Promise.all(pub.files.map((f: { path: string }) =>
          fetch(`/exercises/${id}/code/${f.path}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Missing file ${f.path}. Run \`npm run sync\`.`))))))
        if (!cancelled) {
          setOriginals(Object.fromEntries(pub.files.map((f: { path: string }, i: number) => [f.path, texts[i]])))
          setEx(pub)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (error) return <Shell><Message title="Could not open this exercise" body={error} /></Shell>
  if (!ex || !originals) return <Shell><Message title="Loading…" /></Shell>
  return <Exam key={`${ex.id}:${ex.version}`} ex={ex} originals={originals} />
}

function Exam({ ex, originals }: { ex: FixQuizExercise; originals: Record<string, string> }) {
  const [state, setState] = useState<ExamState>(() => loadExam(ex.id, ex.version) ?? emptyExam(ex))
  useEffect(() => saveExam(ex.id, ex.version, state), [ex, state])
  const [busy, setBusy] = useState<null | 'run' | 'complete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | 'next' | 'complete' | 'restart'>(null)
  const [panel, setPanel] = useState<'tickets' | 'tests'>('tickets')
  const update = (patch: Partial<ExamState>) => setState((s) => ({ ...s, ...patch }))

  async function act(name: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(name)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const start = () => {
    const first = 'README.md' in originals ? 'README.md' : ex.files[0].path
    update({ phase: 'fix', fixStartedAt: Date.now(), edits: {}, openFiles: [first], activeFile: first, lastRun: undefined })
  }
  const runTests = () => act('run', async () => {
    setPanel('tests')
    const r = await examCall<Omit<RunResult, 'at'>>(ex.id, 'run', { files: state.edits })
    update({ lastRun: { ...r, at: Date.now() } })
  })
  const next = () => update({ phase: 'quiz', submitted: { ...state.edits }, quizStartedAt: Date.now() })
  const complete = () => act('complete', async () => {
    const completedAt = Date.now()
    const r = await examCall<{ score: Score; report_path: string; filename: string; html: string }>(ex.id, 'complete', {
      files: state.submitted ?? state.edits,
      candidate: state.candidate,
      answers: state.answers,
      timings: { fix_started_at: state.fixStartedAt, quiz_started_at: state.quizStartedAt, completed_at: completedAt },
    })
    const result: ExamResult = { score: r.score, reportPath: r.report_path, filename: r.filename, html: r.html }
    update({ phase: 'done', completedAt, result })
    downloadHtml(result.filename, result.html)
  })
  const restart = () => {
    clearExam(ex.id, ex.version)
    setState(emptyExam(ex))
  }

  const edit = (path: string, text: string) => setState((s) => {
    const edits = { ...s.edits }
    if (text === originals[path]) delete edits[path]
    else edits[path] = text
    return { ...s, edits }
  })
  const open = (path: string) => setState((s) => ({ ...s, activeFile: path, openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path] }))
  const close = (path: string) => setState((s) => {
    const openFiles = s.openFiles.filter((p) => p !== path)
    const i = s.openFiles.indexOf(path)
    return { ...s, openFiles, activeFile: s.activeFile === path ? openFiles[Math.min(i, openFiles.length - 1)] : s.activeFile }
  })
  const reset = (path: string) => setState((s) => {
    const edits = { ...s.edits }
    delete edits[path]
    return { ...s, edits }
  })

  const answered = ex.quiz.questions.filter((q) => state.answers[q.id]).length
  const total = ex.quiz.questions.length

  if (state.phase === 'intro' || state.phase === 'done') {
    return (
      <Shell>
        {state.phase === 'intro' && <IntroView ex={ex} candidate={state.candidate} onName={(candidate) => update({ candidate })} onStart={start} />}
        {state.phase === 'done' && state.result && <DoneView ex={ex} result={state.result} onRestart={() => setConfirm('restart')} />}
        {confirm === 'restart' && (
          <Confirm title="Start over?" confirmLabel="Start over" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); restart() }}>
            This clears your code changes and answers on this page. Reports you already downloaded are kept.
          </Confirm>
        )}
      </Shell>
    )
  }

  const quiz = state.phase === 'quiz'
  const files = quiz ? state.submitted ?? {} : state.edits
  return (
    <div className="flex h-screen flex-col bg-canvas">
      <TopBar ex={ex} section={quiz ? 'Section 2 of 2 · Quiz' : 'Section 1 of 2 · Fix'}
        startedAt={quiz ? state.quizStartedAt : state.fixStartedAt} minutes={quiz ? ex.quiz.minutes : ex.fix.minutes}>
        {quiz ? (
          <>
            <span className="hidden text-xs text-muted sm:inline">{answered} of {total} answered</span>
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => setConfirm('complete')}>
              {busy === 'complete' ? 'Grading…' : 'Complete'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={btnSecondary} disabled={busy !== null} onClick={runTests}>{busy === 'run' ? 'Running…' : 'Run tests'}</button>
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => setConfirm('next')}>Next: Section 2 →</button>
          </>
        )}
      </TopBar>
      {error && (
        <div role="alert" className="flex flex-none items-start gap-3 border-b border-danger/40 bg-white px-5 py-2.5 text-danger">
          <span className="flex-1 whitespace-pre-wrap">{error}</span>
          <button type="button" className="font-medium hover:underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      <Workbench ex={ex} originals={originals} files={files} readOnly={quiz}
        openFiles={state.openFiles} active={state.activeFile} onOpen={open} onClose={close} onEdit={edit} onReset={reset}>
        {quiz ? (
          <QuizPanel ex={ex} state={state} onAnswer={(q, o) => setState((s) => ({ ...s, answers: { ...s.answers, [q]: o } }))} />
        ) : (
          <FixPanel ex={ex} run={state.lastRun} running={busy === 'run'} tab={panel} onTab={setPanel} onRun={runTests} />
        )}
      </Workbench>

      {confirm === 'next' && (
        <Confirm title="Go to Section 2?" confirmLabel="Go to Section 2" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); next() }}>
          Your code is saved as it is now and graded when you complete the exercise. The editor becomes read-only,
          and you can't come back to Section 1.
        </Confirm>
      )}
      {confirm === 'complete' && (
        <Confirm title="Complete the exercise?" confirmLabel="Complete" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); complete() }}>
          {answered < total && <><b className="font-semibold text-danger">{total - answered} question{total - answered === 1 ? ' is' : 's are'} unanswered.</b> </>}
          Your answers can't be changed afterwards. All tests, including the hidden ones, are run now and the report
          is downloaded as an HTML file.
        </Confirm>
      )}
    </div>
  )
}

function TopBar({ ex, section, startedAt, minutes, children }: {
  ex: FixQuizExercise
  section: string
  startedAt?: number
  minutes: number
  children: ReactNode
}) {
  return (
    <header className="flex h-14 flex-none items-center gap-3 border-b border-line bg-white px-5">
      <Logo />
      <div className="hidden h-6 w-px bg-line sm:block" />
      <div className="hidden min-w-0 flex-col leading-tight sm:flex">
        <span className="truncate text-sm font-semibold">{ex.title}</span>
        <span className="text-xs text-muted">{section}</span>
      </div>
      <div className="flex-1" />
      {startedAt && <Timer startedAt={startedAt} minutes={minutes} />}
      {children}
    </header>
  )
}

// ---- the editor: file tree, tabs, CodeMirror, and a side panel

function Workbench({ ex, originals, files, readOnly, openFiles, active, onOpen, onClose, onEdit, onReset, children }: {
  ex: FixQuizExercise
  originals: Record<string, string>
  files: Record<string, string>
  readOnly: boolean
  openFiles: string[]
  active?: string
  onOpen: (path: string) => void
  onClose: (path: string) => void
  onEdit: (path: string, text: string) => void
  onReset: (path: string) => void
  children: ReactNode
}) {
  const tree = useMemo(() => fileTree(ex.files.map((f) => f.path)), [ex])
  const modified = (p: string) => p in files
  const locked = active ? readOnly || isLocked(active) : true
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-[60vh] min-w-0 flex-1 lg:min-h-0">
        <nav aria-label="Files" className="hidden w-[210px] flex-none overflow-auto border-r border-code-border bg-code-bar py-2 text-[12.5px] text-code-text sm:block">
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-code-dim">Files</div>
          <Tree nodes={tree} depth={0} active={active} modified={modified} onOpen={onOpen} />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col bg-code-bg">
          <div className="flex h-9 flex-none items-stretch border-b border-code-border bg-code-bar text-[12.5px] text-code-dim">
            <select aria-label="Open file" value={active ?? ''} onChange={(e) => onOpen(e.target.value)}
              className="m-1 rounded bg-code-bg px-1 text-code-text sm:hidden">
              {ex.files.map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}
            </select>
            <div className="hidden min-w-0 flex-1 overflow-x-auto sm:flex">
              {openFiles.map((p) => (
                <div key={p} className={`group flex flex-none items-center gap-1.5 border-r border-code-border pl-3 pr-1.5 ${p === active ? 'bg-code-bg text-code-text' : 'hover:text-code-text'}`}>
                  <button type="button" className="flex items-center gap-1.5" onClick={() => onOpen(p)} title={p}>
                    {p.split('/').pop()}
                    {modified(p) && <span className="h-1.5 w-1.5 rounded-full bg-bug" aria-label="modified" />}
                  </button>
                  <button type="button" aria-label={`Close ${p}`} onClick={() => onClose(p)}
                    className="rounded px-1 opacity-60 hover:bg-code-border hover:opacity-100">×</button>
                </div>
              ))}
            </div>
            <div className="ml-auto flex flex-none items-center gap-2 px-3">
              {active && locked && <span title={readOnly ? 'Section 1 is closed' : 'Grading always uses the original test files'}>🔒 read-only</span>}
              {active && !readOnly && modified(active) && (
                <button type="button" onClick={() => onReset(active)} className="rounded border border-code-border px-2 py-0.5 text-code-text hover:border-code-dim">
                  Reset file
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {active
              ? <CodeEditor path={active} doc={files[active] ?? originals[active] ?? ''} readOnly={locked} onChange={onEdit} />
              : <p className="p-6 text-code-dim">Open a file from the list on the left.</p>}
          </div>
        </div>
      </div>
      <aside className="flex min-h-0 w-full flex-none flex-col border-l border-line bg-canvas lg:w-[440px]">{children}</aside>
    </div>
  )
}

function Tree({ nodes, depth, active, modified, onOpen }: {
  nodes: TreeNode[]
  depth: number
  active?: string
  modified: (p: string) => boolean
  onOpen: (p: string) => void
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.path}>
          {n.children ? (
            <>
              <div className="truncate py-0.5 text-code-dim" style={{ paddingLeft: 12 + depth * 14 }}>▾ {n.name}</div>
              <Tree nodes={n.children} depth={depth + 1} active={active} modified={modified} onOpen={onOpen} />
            </>
          ) : (
            <button type="button" onClick={() => onOpen(n.path)} title={n.path}
              className={`flex w-full items-center gap-1.5 py-0.5 pr-2 text-left ${n.path === active ? 'bg-code-bg text-white' : 'hover:bg-code-fold'}`}
              style={{ paddingLeft: 24 + depth * 14 }}>
              <span className="truncate">{n.name}</span>
              {isLocked(n.path) && <span className="text-[10px] opacity-60" aria-label="read-only">🔒</span>}
              {modified(n.path) && <span className="ml-auto h-1.5 w-1.5 flex-none rounded-full bg-bug" aria-label="modified" />}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// ---- side panels

function FixPanel({ ex, run, running, tab, onTab, onRun }: {
  ex: FixQuizExercise
  run?: RunResult
  running: boolean
  tab: 'tickets' | 'tests'
  onTab: (t: 'tickets' | 'tests') => void
  onRun: () => void
}) {
  const byNode = new Map(run?.tests.map((t) => [t.nodeid, t]))
  const tabBtn = (t: 'tickets' | 'tests', label: ReactNode) => (
    <button type="button" onClick={() => onTab(t)} aria-pressed={tab === t}
      className={`h-8 rounded-md px-3 font-medium ${tab === t ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink'}`}>
      {label}
    </button>
  )
  return (
    <>
      <div className="flex flex-none items-center gap-1 border-b border-line bg-chip p-1.5">
        {tabBtn('tickets', 'Tickets')}
        {tabBtn('tests', <>Tests{run && <span className={`ml-1.5 ${run.passed === run.total ? 'text-ok' : 'text-danger'}`}>{run.passed}/{run.total}</span>}</>)}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tab === 'tickets' ? (
          <>
            <p className="leading-[1.55] text-muted">{ex.fix.intro}</p>
            {ex.fix.tickets.map((t) => (
              <article key={t.id} className={`${card} mt-3 p-4`}>
                <div className="flex items-start gap-2">
                  <span className="mt-px flex-none whitespace-nowrap rounded bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Ticket {t.id}</span>
                  <h2 className="text-[14px] font-semibold">{t.title}</h2>
                </div>
                <RichText text={t.text} className="mt-2.5" />
              </article>
            ))}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {run ? <>{run.passed} of {run.total} pass · {new Date(run.at).toLocaleTimeString()}</> : 'Not run yet.'}
              </p>
              <button type="button" className={btnSecondary} disabled={running} onClick={onRun}>{running ? 'Running…' : 'Run tests'}</button>
            </div>
            {ex.fix.tickets.map((tk) => (
              <div key={tk.id} className="mt-4">
                <div className="text-xs font-semibold text-muted">Ticket {tk.id}</div>
                <ul className="mt-1 space-y-1.5">
                  {ex.fix.visible_tests.filter((v) => v.ticket === tk.id).map((v) => {
                    const r = byNode.get(v.nodeid)
                    return (
                      <li key={v.nodeid} className="text-[12.5px]">
                        <div className="flex items-start gap-2">
                          <StatusDot passed={running ? undefined : r?.passed} />
                          <span className="break-all font-mono">{testName(v.nodeid)}</span>
                        </div>
                        {r && !r.passed && r.message && !running && (
                          <pre className="ml-5 mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-[11.5px] leading-[1.45] text-danger">{r.message}</pre>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            <p className="mt-5 border-t border-line pt-3 text-xs leading-[1.45] text-muted">
              Runs the provided tests in <code className="font-mono">tests/</code> against your edited code, exactly as
              grading does. {ex.fix.hidden_test_count > 0 && <>{ex.fix.hidden_test_count} hidden tests also run when you complete.</>}
            </p>
          </>
        )}
      </div>
    </>
  )
}

function QuizPanel({ ex, state, onAnswer }: { ex: FixQuizExercise; state: ExamState; onAnswer: (q: string, o: string) => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <p className="leading-[1.55] text-muted">{ex.quiz.intro}</p>
      {ex.quiz.questions.map((q, i) => {
        const byId = new Map(q.options.map((o) => [o.id, o]))
        const order = (state.order[q.id] ?? q.options.map((o) => o.id)).filter((id) => byId.has(id))
        return (
          <fieldset key={q.id} className={`${card} mt-3 p-4`}>
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="text-xs font-semibold text-muted">Question {i + 1} of {ex.quiz.questions.length}</div>
            <RichText text={q.text} className="mt-1.5 font-medium" />
            <div className="mt-3 flex flex-col gap-1.5">
              {order.map((oid, j) => {
                const picked = state.answers[q.id] === oid
                return (
                  <label key={oid} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 leading-[1.45] ${picked ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'}`}>
                    <input type="radio" name={q.id} value={oid} checked={picked} onChange={() => onAnswer(q.id, oid)} className="mt-[3px] accent-accent" />
                    <span className="w-3.5 flex-none font-semibold text-muted">{String.fromCharCode(65 + j)}</span>
                    <Inline text={byId.get(oid)!.text} />
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

// ---- intro and result

function IntroView({ ex, candidate, onName, onStart }: {
  ex: FixQuizExercise
  candidate: string
  onName: (v: string) => void
  onStart: () => void
}) {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-10">
      <div className="text-xs font-semibold uppercase tracking-wide text-accent">Exercise {ex.id.replace(/^readcode-/, '')} · {ex.language} · {ex.difficulty}</div>
      <h1 className="mt-1 text-xl font-semibold">{ex.title}</h1>
      <p className="mt-2 leading-[1.55] text-muted">Two sections, about {ex.estimated_minutes} minutes in all. Everything happens on this page.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className={`${card} p-4`}>
          <div className="text-xs font-semibold text-muted">Section 1 · Fix · {ex.fix.minutes} min</div>
          <p className="mt-1.5 leading-[1.5]">
            {ex.fix.tickets.length} tickets describe bugs. Fix them in the built-in editor and run the
            {' '}{ex.fix.visible_tests.length} provided tests
            {ex.fix.hidden_test_count > 0 ? `; ${ex.fix.hidden_test_count} hidden tests run when you finish.` : '.'}
          </p>
        </div>
        <div className={`${card} p-4`}>
          <div className="text-xs font-semibold text-muted">Section 2 · Quiz · {ex.quiz.minutes} min</div>
          <p className="mt-1.5 leading-[1.5]">{ex.quiz.questions.length} multiple-choice questions about the code and how the bugs should be fixed.</p>
        </div>
      </div>

      <ul className="mt-5 list-disc space-y-1.5 pl-5 leading-[1.5] text-muted">
        <li>Timers are a guide: they turn red when you're over time, and nothing is cut off.</li>
        <li>Your edits are kept in this browser, so a page refresh doesn't lose them.</li>
        <li><b className="font-semibold text-ink">Next</b> freezes your code and closes Section 1; you can still read the code in Section 2.</li>
        <li><b className="font-semibold text-ink">Complete</b> grades both sections and downloads an HTML report.</li>
      </ul>

      <label className="mt-6 block max-w-[360px]">
        <span className="text-xs font-semibold text-muted">Your name (optional, shown on the report)</span>
        <input value={candidate} onChange={(e) => onName(e.target.value)} maxLength={120}
          className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-white px-3 outline-none focus:border-accent" />
      </label>
      <button type="button" className={`${btnPrimary} mt-5`} onClick={onStart}>Start Section 1</button>
    </div>
  )
}

function DoneView({ ex, result, onRestart }: { ex: FixQuizExercise; result: ExamResult; onRestart: () => void }) {
  const s = result.score
  return (
    <div className="mx-auto max-w-[760px] px-4 py-10">
      <h1 className="text-xl font-semibold">Complete: {ex.title}</h1>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ScoreCard label="Total" value={`${s.total} / ${s.max}`} />
        <ScoreCard label="Section 1 · Fix" value={`${s.fix} / ${s.fix_max}`} sub={`${s.tests_passed} of ${s.tests_total} tests pass`} />
        <ScoreCard label="Section 2 · Quiz" value={`${s.quiz} / ${s.quiz_max}`} sub={`${s.quiz_correct} of ${s.quiz_total} correct`} />
      </div>
      <div className={`${card} mt-5 p-4 leading-[1.5]`}>
        The report was downloaded as <b className="font-semibold">{result.filename}</b> and saved to
        <CopyLine text={result.reportPath} />
        <p className="mt-2 text-xs text-muted">It includes the answer key. Share it with your interviewer or reviewer.</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => downloadHtml(result.filename, result.html)}>Download report again</button>
        <a href="#/exercises" className={`${btnSecondary} flex items-center`}>Back to exercises</a>
        <button type="button" className={btnSecondary} onClick={onRestart}>Start over</button>
      </div>
    </div>
  )
}

// ---- small pieces

function ScoreCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

function StatusDot({ passed }: { passed?: boolean }) {
  if (passed === undefined) return <span className="mt-[5px] h-2 w-2 flex-none rounded-full bg-track" title="Not run yet" />
  return passed
    ? <span className="w-3 flex-none font-bold text-ok" aria-label="pass">✓</span>
    : <span className="w-3 flex-none font-bold text-danger" aria-label="fail">✗</span>
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  }
  return (
    <div className="mt-1.5 flex items-stretch gap-2">
      <code className="min-w-0 flex-1 select-all break-all rounded-md bg-chip px-2 py-1.5 font-mono text-[12px] leading-[1.4]">{text}</code>
      <button type="button" onClick={copy} className="flex-none rounded-md border border-line-strong px-2 text-xs font-medium hover:border-ink">{copied ? 'Copied' : 'Copy'}</button>
    </div>
  )
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/)
  return <span>{parts.map((p, i) => (i % 2 ? <code key={i} className="rounded bg-chip px-1 py-px font-mono text-[12px]">{p}</code> : p))}</span>
}

function RichText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2.5 leading-[1.55] ${className}`}>
      {text.split('\n\n').map((p, i) => <p key={i}><Inline text={p} /></p>)}
    </div>
  )
}

function Confirm({ title, confirmLabel, children, onCancel, onConfirm }: {
  title: string
  confirmLabel: string
  children: ReactNode
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,22,33,0.45)] p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="w-full max-w-[460px] rounded-xl border border-line bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
        <h2 id="confirm-title" className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-2 text-[13px] leading-[1.5] text-muted">{children}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onCancel} className={btnSecondary}>Cancel</button>
          <button type="button" onClick={onConfirm} className={btnPrimary}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center border-b border-line bg-white px-5"><Logo /></header>
      {children}
    </div>
  )
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-[560px] px-4 py-16">
      <h1 className="text-lg font-semibold">{title}</h1>
      {body && <p className="mt-2 text-muted">{body}</p>}
      {body && <a href="#/exercises" className="mt-4 inline-block font-medium text-accent hover:underline">Back to exercises</a>}
    </div>
  )
}
