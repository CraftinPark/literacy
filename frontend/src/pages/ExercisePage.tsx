import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Logo } from '../components/Logo'
import { CodeEditor } from '../exercise/CodeEditor'
import type { CodeEditorHandle, Insert, LineMark } from '../exercise/CodeEditor'
import { CommentCard, Composer, canSave } from '../exercise/Comments'
import type { DraftState } from '../exercise/Comments'
import { Header } from '../exercise/Header'
import { SidePanel } from '../exercise/SidePanel'
import type { Tab } from '../exercise/SidePanel'
import { Sidebar } from '../exercise/Sidebar'
import { lineMap, toCurrentRange, toOriginalRange } from '../lib/linediff'
import { allFunctions, functionAt, parseOutline } from '../lib/outline'
import { clearAnswers, emptyAnswers, loadAnswers, saveAnswers } from '../lib/storage'
import { buildSubmission } from '../lib/submission'
import type { Submission } from '../lib/submission'
import type { Answers, CodeComment, Dimension, PublicExercise, Range } from '../lib/types'

const CONTEXT_LINES = 3
const CANDIDATE_ID = 'local' // no accounts yet

export default function ExercisePage({ id }: { id: string }) {
  const [ex, setEx] = useState<PublicExercise | null>(null)
  const [sources, setSources] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/exercises/${id}/public.json`)
        if (!res.ok) throw new Error(`Exercise ${id} was not found.`)
        const pub: PublicExercise = await res.json()
        const texts = await Promise.all(pub.files.map((f) => fetch(`/exercises/${id}/code/${f.path}`).then((r) => r.text())))
        // Files end with a newline; the editor works on the text without it so line counts match public.json.
        if (!cancelled) { setEx(pub); setSources(Object.fromEntries(pub.files.map((f, i) => [f.path, texts[i].replace(/\n$/, '')]))) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (error) return <Message title="Could not open this exercise" body={error} />
  if (!ex || sources == null) return <Message title="Loading…" />
  return <Workspace key={`${ex.id}:${ex.version}`} ex={ex} sources={sources} />
}

/**
 * Comments are stored with ORIGINAL line numbers (what the answer key uses). The candidate may edit
 * the code, so everything shown in the editor goes through a per-file line map (lib/linediff.ts).
 */
function Workspace({ ex, sources }: { ex: PublicExercise; sources: Record<string, string> }) {
  const [answers, setAnswers] = useState<Answers>(() => loadAnswers(ex.id, ex.version) ?? emptyAnswers())
  useEffect(() => saveAnswers(ex.id, ex.version, answers), [answers, ex])

  const files = useMemo(() => ex.files.map(({ path }) => {
    const original = sources[path]
    const current = answers.edits[path] ?? original
    return { path, original, current, map: lineMap(original, current), sections: parseOutline(current.split('\n'), ex.language) }
  }), [ex, sources, answers.edits])
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files])
  const [active, setActive] = useState(files[0].path)
  const file = byPath.get(active) ?? files[0]
  const { path, sections, map } = file
  const functions = useMemo(() => files.flatMap((f) => allFunctions(f.sections).map((fn) => ({ ...fn, file: f.path }))), [files])
  const totalLines = ex.files.reduce((n, f) => n + f.line_count, 0)
  const editorFiles = useMemo(() => files.map(({ path, original, current }) => ({ path, original, current })), [files])

  const onEdit = useCallback((p: string, text: string) => setAnswers((a) => {
    if ((a.edits[p] ?? sources[p]) === text) return a
    const edits = { ...a.edits }
    if (text === sources[p]) delete edits[p]
    else edits[p] = text
    return { ...a, edits }
  }), [sources])

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [tab, setTab] = useState<Tab>('understand')
  const [topLine, setTopLine] = useState(1)
  const [focus, setFocus] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [submitted, setSubmitted] = useState<Submission | null>(null)
  const code = useRef<CodeEditorHandle>(null)
  const pendingScroll = useRef<number | null>(null)

  // ---- navigation (lines here are CURRENT line numbers in the target file)
  const jump = useCallback((line: number, to: string = active) => {
    if (focus || to !== active) {
      setFocus(false)
      setActive(to)
      pendingScroll.current = line
    } else {
      code.current?.scrollToLine(line)
    }
  }, [focus, active])
  useEffect(() => {
    if (pendingScroll.current != null) {
      code.current?.scrollToLine(pendingScroll.current)
      pendingScroll.current = null
    }
  })
  const openFile = (to: string) => {
    if (to === active) return
    setActive(to)
    setTopLine(1)
  }
  const jumpToComment = (c: CodeComment) => {
    const r = c.ranges[0]
    const m = byPath.get(r.file)?.map
    jump(m ? toCurrentRange(m, r.start_line, r.end_line).start : r.start_line, r.file)
  }

  // Ctrl/⌘-F anywhere on the page opens the editor's find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        code.current?.find()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- comments
  /** A comment's ranges in the open file, in current line numbers. */
  const here = (c: CodeComment) => c.ranges.filter((r) => r.file === path).map((r) => toCurrentRange(map, r.start_line, r.end_line))
  const fnAt = (line: number) => functionAt(sections, line)?.name
  const onSelect = useCallback((start: number, end: number) => {
    const o = toOriginalRange(map, start, end)
    const range: Range = { file: path, start_line: o.start, end_line: o.end }
    const fn = functionAt(sections, start)?.name
    setDraft((d) => {
      if (d?.linking) return { ...d, linking: false, comment: { ...d.comment, ranges: [...d.comment.ranges, range] } }
      if (d && (d.comment.text.trim() || d.editingId)) {
        // Re-anchor the comment being written instead of throwing its text away.
        return { ...d, comment: { ...d.comment, ranges: [range], function: fn } }
      }
      return { editingId: null, linking: false, comment: { id: '', type: 'bug', ranges: [range], text: '', function: fn } }
    })
  }, [path, sections, map])

  const saveDraft = () => {
    if (!draft || !canSave(draft.comment)) return
    const c = { ...draft.comment }
    if (c.type !== 'bug') { delete c.severity; delete c.confidence; delete c.fix }
    if (!c.fix?.trim()) delete c.fix
    const order = (f: string) => files.findIndex((x) => x.path === f)
    c.ranges = [...c.ranges].sort((a, b) => order(a.file) - order(b.file) || a.start_line - b.start_line)
    setAnswers((a) => draft.editingId
      ? { ...a, comments: a.comments.map((x) => (x.id === draft.editingId ? { ...c, id: draft.editingId! } : x)) }
      : { ...a, comments: [...a.comments, { ...c, id: nextCommentId(a.comments) }] })
    setDraft(null)
  }
  const deleteComment = (cid: string) => setAnswers((a) => ({ ...a, comments: a.comments.filter((c) => c.id !== cid) }))

  const marks = useMemo<LineMark[]>(() => [
    ...answers.comments.filter((c) => c.id !== draft?.editingId).flatMap(here).map((r) => ({ ...r, kind: 'saved' as const })),
    ...(draft ? here(draft.comment) : []).map((r) => ({ ...r, kind: 'draft' as const })),
  ], [answers.comments, draft, path, map])

  const lastLine = (c: CodeComment) => Math.max(...here(c).map((r) => r.end))
  const inserts: Insert[] = []
  for (const c of answers.comments) {
    if (c.id === draft?.editingId || c.ranges[0].file !== path) continue
    const now = here(c)
    const shownAt = now.map((r) => ({ file: path, start_line: r.start, end_line: r.end }))
    inserts.push({ key: c.id, afterLine: lastLine(c), node: <CommentCard c={c} shownAt={shownAt} removed={now.every((r) => r.removed)} onDelete={() => deleteComment(c.id)}
      onEdit={() => setDraft({ editingId: c.id, linking: false, comment: { ...c } })} /> })
  }
  const newest = draft?.comment.ranges[draft.comment.ranges.length - 1]
  if (draft && newest?.file === path) {
    inserts.push({ key: 'composer', afterLine: lastLine(draft.comment), node: <Composer draft={draft} onSave={saveDraft} onCancel={() => setDraft(null)}
      onChange={(comment) => setDraft({ ...draft, comment })} onToggleLink={() => setDraft({ ...draft, linking: !draft.linking })} /> })
  }

  const lineCount = file.current.split('\n').length
  const focusLines = useMemo(() => {
    if (!focus) return null
    const s = new Set<number>()
    for (const r of [...answers.comments.flatMap(here), ...(draft ? here(draft.comment) : [])]) {
      for (let n = Math.max(1, r.start - CONTEXT_LINES); n <= Math.min(lineCount, r.end + CONTEXT_LINES); n++) s.add(n)
      const fn = functionAt(sections, r.start)
      if (fn) s.add(fn.line)
    }
    return s
  }, [focus, answers.comments, draft, lineCount, sections, path, map])

  // ---- progress
  const answeredCount = ex.questions.filter((q) => answers.answers[q.id]?.trim()).length
  const savedCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of answers.comments) {
      if (c.function && c.ranges[0].file === path) m.set(c.function, (m.get(c.function) ?? 0) + 1)
    }
    return m
  }, [answers.comments, path])
  const fileEntries = useMemo(() => files.map((f) => ({
    path: f.path,
    lines: f.current.split('\n').length,
    comments: answers.comments.filter((c) => c.ranges.some((r) => r.file === f.path)).length,
    edited: f.current !== f.original,
  })), [files, answers.comments])
  const draftFirst = draft && !draft.editingId ? draft.comment.ranges[0] : undefined

  const submit = () => {
    setSubmitted(buildSubmission(ex, answers, sources, CANDIDATE_ID))
    clearAnswers(ex.id, ex.version)
    setReviewing(false)
  }

  if (submitted) return <SubmittedView sub={submitted} ex={ex} />

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <Header ex={ex} lines={totalLines} answeredCount={answeredCount} totalPrompts={ex.questions.length}
        commentCount={answers.comments.length} startedAt={answers.startedAt} onSubmit={() => setReviewing(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar rootName={ex.id} files={fileEntries} activeFile={path} onOpenFile={openFile} sections={sections}
          currentFn={fnAt(topLine)} savedCount={savedCount}
          draftFn={draftFirst?.file === path ? draft!.comment.function : undefined} onJump={jump} />
        <CodeEditor ref={code} files={editorFiles} path={path} marks={marks} inserts={inserts} focusLines={focusLines}
          breadcrumb={fnAt(topLine)} linking={!!draft?.linking} onChange={onEdit} onSelectLines={onSelect}
          onOpenFile={(to, line) => jump(line, to)} onTopLineChange={setTopLine} onShowAll={() => setFocus(false)}
          focus={focus} canFocus={answers.comments.some((c) => here(c).length > 0) || !!draft} onToggleFocus={() => setFocus((f) => !f)} />
        <SidePanel tab={tab} onTab={setTab} intro={ex.intro} questions={ex.questions} answers={answers.answers}
          comments={answers.comments} improvements={answers.improvements} functions={functions}
          multiFile={files.length > 1} onJump={(f, line) => jump(line, f)} onJumpToComment={jumpToComment}
          onReview={() => setReviewing(true)}
          onAnswer={(qid, text) => setAnswers((a) => ({ ...a, answers: { ...a.answers, [qid]: text } }))}
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
  const of = (d: Dimension) => ex.questions.filter((q) => q.dimension === d)
  const answered = (d: Dimension) => of(d).filter((q) => answers.answers[q.id]?.trim()).length
  const bugs = answers.comments.filter((c) => c.type === 'bug').length
  const improvements = answers.improvements.length + answers.comments.filter((c) => c.type === 'improvement').length
  const qs = (d: Dimension) => (of(d).length ? `${answered(d)} of ${of(d).length} answered` : '')
  const join = (...xs: string[]) => xs.filter(Boolean).join(' · ')
  const rows: [string, string, boolean][] = [
    ['Understand', qs('understanding'), answered('understanding') === of('understanding').length],
    ['Bugs', join(qs('bugs'), `${bugs} bug comment${bugs === 1 ? '' : 's'}`), bugs > 0 || answered('bugs') > 0],
    ['Design', qs('design'), answered('design') === of('design').length],
    ['Improve', join(qs('improvements'), of('improvements').length ? '' : `${improvements} suggestion${improvements === 1 ? '' : 's'}`),
      improvements > 0 || (of('improvements').length > 0 && answered('improvements') === of('improvements').length)],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.6)] p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="w-full max-w-[460px] rounded-xl bg-surface p-6 shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
        <h2 id="review-title" className="text-[15px] font-semibold">Submit for review?</h2>
        <p className="mt-1 text-[12.5px] leading-[1.45] text-muted">You can't change your answers after submitting.</p>
        <div className="mt-4 flex flex-col gap-1">
          {rows.map(([name, value, ok]) => (
            <div key={name} className="flex items-center justify-between rounded-md bg-field px-3 py-2.5">
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
          <button type="button" autoFocus onClick={onCancel} className="h-9 rounded-lg bg-chip px-3.5 font-medium hover:bg-track">Keep working</button>
          <button type="button" onClick={onSubmit} className="h-9 rounded-lg bg-accent px-4 font-semibold text-accent-on">Submit</button>
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
      <header className="flex h-14 items-center gap-5 bg-canvas px-5"><Logo /></header>
      <div className="mx-auto max-w-[760px] px-4 py-10">
        <h1 className="text-xl font-semibold">Submitted: {ex.title}</h1>
        <p className="mt-2 leading-[1.5] text-muted">
          {Object.keys(sub.answers).length} of {ex.questions.length} questions answered · {sub.bugs.length} bug comment{sub.bugs.length === 1 ? '' : 's'}
          · {sub.improvements.length} other improvement{sub.improvements.length === 1 ? '' : 's'} · {sub.time_spent_minutes} minutes
        </p>
        <div className="mt-5 rounded-[10px] bg-surface p-4 leading-[1.5]">
          <b className="font-semibold">Grading isn't connected yet.</b> Below is your submission
          (<code className="rounded bg-chip px-1.5 py-px font-mono text-[12.5px]">schemas/submission.schema.json</code>), which a grader will read.
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={copy} className="h-9 rounded-lg bg-accent px-4 font-semibold text-accent-on">{copied ? 'Copied' : 'Copy submission'}</button>
          <a href="#/exercises" className="flex h-9 items-center rounded-lg bg-chip px-3.5 font-medium hover:bg-track">Back to exercises</a>
        </div>
        <pre className="mt-4 max-h-[60vh] overflow-auto rounded-[10px] bg-code-bg p-4 font-mono text-xs leading-5 text-code-text">{json}</pre>
      </div>
    </div>
  )
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center bg-canvas px-5"><Logo /></header>
      <div className="mx-auto max-w-[560px] px-4 py-16">
        <h1 className="text-lg font-semibold">{title}</h1>
        {body && <p className="mt-2 text-muted">{body}</p>}
        {body && <a href="#/exercises" className="mt-4 inline-block font-medium text-accent-text hover:underline">Back to exercises</a>}
      </div>
    </div>
  )
}
