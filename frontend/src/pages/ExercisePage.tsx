import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'
import { CodePane } from '../exercise/CodePane'
import type { CodePaneHandle, LineMark } from '../exercise/CodePane'
import { CommentCard, Composer, canSave } from '../exercise/Comments'
import type { DraftState } from '../exercise/Comments'
import { Header } from '../exercise/Header'
import { SidePanel } from '../exercise/SidePanel'
import type { Tab } from '../exercise/SidePanel'
import { Sidebar } from '../exercise/Sidebar'
import { highlightC } from '../lib/highlight'
import { allFunctions, functionAt, parseOutline } from '../lib/outline'
import { clearAnswers, emptyAnswers, loadAnswers, saveAnswers } from '../lib/storage'
import { buildSubmission } from '../lib/submission'
import type { Submission } from '../lib/submission'
import type { Answers, CodeComment, PublicExercise } from '../lib/types'

const CONTEXT_LINES = 3
const CANDIDATE_ID = 'local' // no accounts yet

export default function ExercisePage({ id }: { id: string }) {
  const [ex, setEx] = useState<PublicExercise | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/exercises/${id}/public.json`)
        if (!res.ok) throw new Error(`Exercise ${id} was not found.`)
        const pub: PublicExercise = await res.json()
        // One file per exercise for now; multi-file exercises need a file switcher.
        const code = await fetch(`/exercises/${id}/code/${pub.files[0].path}`).then((r) => r.text())
        if (!cancelled) { setEx(pub); setSource(code) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (error) return <Message title="Could not open this exercise" body={error} />
  if (!ex || source == null) return <Message title="Loading…" />
  return <Workspace key={`${ex.id}:${ex.version}`} ex={ex} source={source} />
}

function Workspace({ ex, source }: { ex: PublicExercise; source: string }) {
  const path = ex.files[0].path
  const lines = useMemo(() => source.replace(/\n$/, '').split('\n'), [source])
  const tokens = useMemo(() => highlightC(source.replace(/\n$/, '')), [source])
  const sections = useMemo(() => parseOutline(lines), [lines])
  const functions = useMemo(() => allFunctions(sections), [sections])

  const [answers, setAnswers] = useState<Answers>(() => loadAnswers(ex.id, ex.version) ?? emptyAnswers())
  useEffect(() => saveAnswers(ex.id, ex.version, answers), [answers, ex])

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [tab, setTab] = useState<Tab>('understand')
  const [topLine, setTopLine] = useState(1)
  const [focus, setFocus] = useState(false)
  const [query, setQuery] = useState('')
  const [hitIdx, setHitIdx] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [submitted, setSubmitted] = useState<Submission | null>(null)
  const code = useRef<CodePaneHandle>(null)
  const search = useRef<HTMLInputElement>(null)
  const pendingScroll = useRef<number | null>(null)

  // ---- navigation
  const jump = useCallback((line: number) => {
    if (focus) {
      setFocus(false)
      pendingScroll.current = line
    } else {
      code.current?.scrollToLine(line)
    }
  }, [focus])
  useEffect(() => {
    if (pendingScroll.current != null) {
      code.current?.scrollToLine(pendingScroll.current)
      pendingScroll.current = null
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        search.current?.focus()
        search.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- search
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? lines.flatMap((l, i) => (l.toLowerCase().includes(q) ? [i + 1] : [])) : []
  }, [query, lines])
  const hitSet = useMemo(() => new Set(hits), [hits])
  const activeHit = hits.length ? hits[Math.min(hitIdx, hits.length - 1)] : null
  const onQuery = (q: string) => { setQuery(q); setHitIdx(0) }
  const onNextHit = (back: boolean) => {
    if (!hits.length) return
    const i = (Math.min(hitIdx, hits.length - 1) + (back ? hits.length - 1 : 1)) % hits.length
    setHitIdx(i)
    jump(hits[i])
  }
  useEffect(() => { if (activeHit != null) jump(activeHit) }, [query])

  // ---- comments
  const fnAt = (line: number) => functionAt(sections, line)?.name
  const onSelect = useCallback((start: number, end: number) => {
    const range = { file: path, start_line: start, end_line: end }
    setDraft((d) => {
      if (d?.linking) return { ...d, linking: false, comment: { ...d.comment, ranges: [...d.comment.ranges, range] } }
      if (d && (d.comment.text.trim() || d.editingId)) {
        // Re-anchor the comment being written instead of throwing its text away.
        return { ...d, comment: { ...d.comment, ranges: [range], function: functionAt(sections, start)?.name } }
      }
      return {
        editingId: null,
        linking: false,
        comment: { id: '', type: 'bug', ranges: [range], text: '', function: functionAt(sections, start)?.name },
      }
    })
  }, [path, sections])

  const saveDraft = () => {
    if (!draft || !canSave(draft.comment)) return
    const c = { ...draft.comment }
    if (c.type !== 'bug') { delete c.severity; delete c.confidence; delete c.fix }
    if (!c.fix?.trim()) delete c.fix
    c.ranges = [...c.ranges].sort((a, b) => a.start_line - b.start_line)
    setAnswers((a) => draft.editingId
      ? { ...a, comments: a.comments.map((x) => (x.id === draft.editingId ? { ...c, id: draft.editingId! } : x)) }
      : { ...a, comments: [...a.comments, { ...c, id: nextCommentId(a.comments) }] })
    setDraft(null)
  }
  const deleteComment = (cid: string) => setAnswers((a) => ({ ...a, comments: a.comments.filter((c) => c.id !== cid) }))

  const marks = useMemo(() => {
    const m = new Map<number, LineMark>()
    for (const c of answers.comments) {
      if (c.id === draft?.editingId) continue
      for (const r of c.ranges) for (let n = r.start_line; n <= r.end_line; n++) m.set(n, 'saved')
    }
    for (const r of draft?.comment.ranges ?? []) for (let n = r.start_line; n <= r.end_line; n++) m.set(n, 'draft')
    return m
  }, [answers.comments, draft])

  const lastLine = (c: CodeComment) => Math.max(...c.ranges.map((r) => r.end_line))
  const inserts = useMemo(() => {
    const m = new Map<number, ReactNode[]>()
    const add = (line: number, node: ReactNode) => m.set(line, [...(m.get(line) ?? []), node])
    for (const c of answers.comments) {
      if (c.id === draft?.editingId) continue
      add(lastLine(c), <CommentCard key={c.id} c={c} onDelete={() => deleteComment(c.id)}
        onEdit={() => setDraft({ editingId: c.id, linking: false, comment: { ...c } })} />)
    }
    if (draft && draft.comment.ranges.length) {
      add(lastLine(draft.comment), <Composer key="composer" draft={draft} onSave={saveDraft} onCancel={() => setDraft(null)}
        onChange={(comment) => setDraft({ ...draft, comment })} onToggleLink={() => setDraft({ ...draft, linking: !draft.linking })} />)
    }
    return new Map([...m].map(([k, v]) => [k, <>{v}</>]))
  }, [answers.comments, draft])

  const focusLines = useMemo(() => {
    if (!focus) return null
    const s = new Set<number>()
    const ranges = [...answers.comments.flatMap((c) => c.ranges), ...(draft?.comment.ranges ?? [])]
    for (const r of ranges) {
      for (let n = Math.max(1, r.start_line - CONTEXT_LINES); n <= Math.min(lines.length, r.end_line + CONTEXT_LINES); n++) s.add(n)
      const fn = functionAt(sections, r.start_line)
      if (fn) s.add(fn.line)
    }
    return s
  }, [focus, answers.comments, draft, lines.length, sections])

  // ---- progress
  const answeredCount = [...ex.questions.map((q) => answers.comprehension[q.id]), ...ex.design_prompts.map((d) => answers.design[d.id])]
    .filter((v) => v?.trim()).length
  const totalPrompts = ex.questions.length + ex.design_prompts.length
  const savedCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of answers.comments) if (c.function) m.set(c.function, (m.get(c.function) ?? 0) + 1)
    return m
  }, [answers.comments])

  const submit = () => {
    setSubmitted(buildSubmission(ex, answers, CANDIDATE_ID))
    clearAnswers(ex.id, ex.version)
    setReviewing(false)
  }

  if (submitted) return <SubmittedView sub={submitted} ex={ex} />

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <Header ex={ex} lines={lines.length} answeredCount={answeredCount} totalPrompts={totalPrompts}
        commentCount={answers.comments.length} startedAt={answers.startedAt} onSubmit={() => setReviewing(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar ref={search} sections={sections} currentFn={fnAt(topLine)} savedCount={savedCount}
          draftFn={draft && !draft.editingId ? draft.comment.function : undefined}
          query={query} onQuery={onQuery} onNextHit={onNextHit} onJump={jump}
          hitInfo={hits.length ? `${Math.min(hitIdx, hits.length - 1) + 1} of ${hits.length} · Enter for next` : 'No matches'} />
        <CodePane ref={code} path={path} tokens={tokens} marks={marks} inserts={inserts} focusLines={focusLines}
          searchHits={hitSet} activeHit={activeHit} breadcrumb={fnAt(topLine)} onSelect={onSelect}
          onTopLineChange={setTopLine} onShowAll={() => setFocus(false)}
          focus={focus} canFocus={answers.comments.length > 0 || !!draft} onToggleFocus={() => setFocus((f) => !f)} />
        <SidePanel tab={tab} onTab={setTab} questions={ex.questions} prompts={ex.design_prompts}
          comprehension={answers.comprehension} design={answers.design} comments={answers.comments}
          improvements={answers.improvements} functions={functions} onJump={jump} onReview={() => setReviewing(true)}
          onAnswer={(section, qid, text) => setAnswers((a) => ({ ...a, [section]: { ...a[section], [qid]: text } }))}
          onImprovements={(improvements) => setAnswers((a) => ({ ...a, improvements }))} />
      </div>
      {reviewing && (
        <ReviewDialog ex={ex} answers={answers} unsavedDraft={!!draft?.comment.text.trim()}
          onCancel={() => setReviewing(false)} onSubmit={submit} />
      )}
    </div>
  )
}

function nextCommentId(existing: CodeComment[]) {
  const max = existing.reduce((m, c) => Math.max(m, Number(c.id.replace(/^c/, '')) || 0), 0)
  return `c${max + 1}`
}

function ReviewDialog({ ex, answers, unsavedDraft, onCancel, onSubmit }: {
  ex: PublicExercise
  answers: Answers
  unsavedDraft: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const unanswered = (items: { id: string }[], rec: Record<string, string>) => items.filter((q) => !rec[q.id]?.trim()).map((q) => q.id)
  const missingC = unanswered(ex.questions, answers.comprehension)
  const missingD = unanswered(ex.design_prompts, answers.design)
  const bugs = answers.comments.filter((c) => c.type === 'bug').length
  const improvements = answers.improvements.length + answers.comments.filter((c) => c.type === 'improvement').length
  const rows: [string, string, boolean][] = [
    ['Understand', `${ex.questions.length - missingC.length} of ${ex.questions.length} answered`, missingC.length === 0],
    ['Bugs', `${bugs} bug comment${bugs === 1 ? '' : 's'}`, bugs > 0],
    ['Design', `${ex.design_prompts.length - missingD.length} of ${ex.design_prompts.length} answered`, missingD.length === 0],
    ['Improve', `${improvements} suggestion${improvements === 1 ? '' : 's'}`, improvements > 0],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,22,33,0.45)] p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="w-full max-w-[460px] rounded-xl border border-line bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
        <h2 id="review-title" className="text-[15px] font-semibold">Submit for review?</h2>
        <p className="mt-1 text-[12.5px] leading-[1.45] text-muted">You can't change your answers after submitting.</p>
        <div className="mt-4 divide-y divide-line rounded-[10px] border border-line">
          {rows.map(([name, value, ok]) => (
            <div key={name} className="flex items-center justify-between px-3 py-2.5">
              <span className="font-medium">{name}</span>
              <span className={ok ? 'text-ok' : 'text-muted'}>{value}</span>
            </div>
          ))}
        </div>
        {unsavedDraft && (
          <p className="mt-3 rounded-md bg-bug-soft px-3 py-2 text-xs leading-[1.45]">
            You have a comment you haven't saved. It won't be included unless you save it first.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onCancel} className="h-9 rounded-lg border border-line-strong bg-white px-3.5 font-medium hover:border-ink">Keep working</button>
          <button type="button" onClick={onSubmit} className="h-9 rounded-lg bg-accent px-4 font-semibold text-white">Submit</button>
        </div>
      </div>
    </div>
  )
}

function SubmittedView({ sub, ex }: { sub: Submission; ex: PublicExercise }) {
  const json = JSON.stringify(sub, null, 2)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  }
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center gap-5 border-b border-line bg-white px-5"><Logo /></header>
      <div className="mx-auto max-w-[760px] px-4 py-10">
        <h1 className="text-xl font-semibold">Submitted: {ex.title}</h1>
        <p className="mt-2 leading-[1.5] text-muted">
          {sub.bugs.length} bug comment{sub.bugs.length === 1 ? '' : 's'} · {Object.keys(sub.comprehension).length} of {ex.questions.length} questions
          · {Object.keys(sub.design).length} of {ex.design_prompts.length} design prompts · {sub.improvements.length} improvements · {sub.time_spent_minutes} minutes
        </p>
        <div className="mt-5 rounded-[10px] border border-line bg-white p-4 leading-[1.5]">
          <b className="font-semibold">Grading isn't connected yet.</b> Below is the submission the grader will receive.
          To grade it locally, save it as a file and run{' '}
          <code className="rounded bg-chip px-1.5 py-px font-mono text-[12.5px]">cd backend && python -m grader ../examples/{ex.id} submission.json</code>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={copy} className="h-9 rounded-lg bg-accent px-4 font-semibold text-white">{copied ? 'Copied' : 'Copy submission'}</button>
          <a href="#/exercises" className="flex h-9 items-center rounded-lg border border-line-strong bg-white px-3.5 font-medium hover:border-ink">Back to exercises</a>
        </div>
        <pre className="mt-4 max-h-[60vh] overflow-auto rounded-[10px] bg-code-bg p-4 font-mono text-xs leading-5 text-code-text">{json}</pre>
      </div>
    </div>
  )
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center border-b border-line bg-white px-5"><Logo /></header>
      <div className="mx-auto max-w-[560px] px-4 py-16">
        <h1 className="text-lg font-semibold">{title}</h1>
        {body && <p className="mt-2 text-muted">{body}</p>}
        {body && <a href="#/exercises" className="mt-4 inline-block font-medium text-accent hover:underline">Back to exercises</a>}
      </div>
    </div>
  )
}
