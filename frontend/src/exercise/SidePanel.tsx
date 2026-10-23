import { useState } from 'react'
import type { ReactNode } from 'react'
import type { OutlineFunction } from '../lib/outline'
import type { CodeComment, Improvement } from '../lib/types'
import { LABEL, formatRanges } from '../lib/types'

export type Tab = 'understand' | 'bugs' | 'design' | 'improve'
const TABS: Tab[] = ['understand', 'bugs', 'design', 'improve']
const TAB_LABEL: Record<Tab, string> = { understand: 'Understand', bugs: 'Bugs', design: 'Design', improve: 'Improve' }

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Render function names that appear in a prompt as code chips. */
function PromptText({ text, fnNames }: { text: string; fnNames: string[] }) {
  if (!fnNames.length) return <>{text}</>
  const re = new RegExp(`\\b(${fnNames.join('|')})\\b`, 'g')
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) => i % 2 ? (
        <span key={i} className="rounded bg-chip px-[5px] py-px font-mono text-[12.5px] font-medium">{p}</span>
      ) : p)}
    </>
  )
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B7F4B" strokeWidth="2.2" strokeLinecap="round"
      strokeLinejoin="round" role="img" aria-label="Answered" className="flex-none">
      <circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  )
}

function PromptList({ items, answers, onAnswer, functions, onJump }: {
  items: { id: string; text: string }[]
  answers: Record<string, string>
  onAnswer: (id: string, text: string) => void
  functions: OutlineFunction[]
  onJump: (line: number) => void
}) {
  const [active, setActive] = useState<string | null>(() => items.find((q) => !answers[q.id]?.trim())?.id ?? null)
  const names = functions.map((f) => f.name)
  return (
    <>
      {items.map((q, i) => {
        const answer = answers[q.id] ?? ''
        const done = answer.trim().length > 0
        const mentioned = functions.find((f) => new RegExp(`\\b${f.name}\\b`).test(q.text))
        if (active === q.id) {
          return (
            <div key={q.id} className="flex flex-col gap-2.5 rounded-[10px] border-[1.5px] border-accent p-3 shadow-[0_2px_10px_rgba(31,79,216,0.12)]">
              <div className="flex items-start gap-2.5">
                <span className="h-[22px] w-[22px] flex-none rounded-full bg-accent text-center text-xs font-semibold leading-[22px] text-white">{i + 1}</span>
                <div className="font-medium leading-[1.4]"><PromptText text={q.text} fnNames={names} /></div>
              </div>
              {mentioned && (
                <button type="button" onClick={() => onJump(mentioned.line)}
                  className="ml-8 h-7 self-start rounded-md border border-line-strong bg-white px-2.5 text-xs font-medium hover:border-ink">
                  Jump to {mentioned.name} · line {mentioned.line} →
                </button>
              )}
              <label htmlFor={`ans-${q.id}`} className="ml-8 text-xs text-muted">Your answer</label>
              <textarea id={`ans-${q.id}`} autoFocus value={answer} onChange={(e) => onAnswer(q.id, e.target.value)}
                className="-mt-1 ml-8 h-[150px] w-[calc(100%-32px)] resize-y rounded-lg border border-line-strong p-2.5 leading-normal outline-none focus:border-accent" />
              <div className="ml-8 flex justify-between text-xs text-muted">
                <span>{wordCount(answer)} words · Autosaved</span>
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setActive(null)}>Done</button>
              </div>
            </div>
          )
        }
        return (
          <button key={q.id} type="button" onClick={() => setActive(q.id)}
            className="flex flex-col gap-1.5 rounded-[10px] border border-line p-3 text-left hover:border-line-strong">
            <div className="flex items-start gap-2.5">
              {done ? <CheckIcon /> : (
                <span className="h-5 w-5 flex-none rounded-full border-[1.5px] border-[#8A97A8] text-center text-xs font-semibold leading-[17px] text-muted">{i + 1}</span>
              )}
              <div>
                <div className="font-medium leading-[1.4]"><PromptText text={q.text} fnNames={names} /></div>
                {!done && <div className="mt-0.5 text-xs text-muted">Not answered</div>}
              </div>
            </div>
            {done && (
              <>
                <div className="ml-8 line-clamp-2 text-[12.5px] leading-[1.45] text-muted">{answer}</div>
                <span className="ml-8 text-xs font-medium text-accent">Edit answer</span>
              </>
            )}
          </button>
        )
      })}
    </>
  )
}

function CommentList({ comments, onJump, empty }: { comments: CodeComment[]; onJump: (c: CodeComment) => void; empty: ReactNode }) {
  if (!comments.length) return <div className="rounded-[10px] border border-dashed border-line-strong p-4 text-[12.5px] leading-[1.45] text-muted">{empty}</div>
  return (
    <>
      {comments.map((c) => (
        <button key={c.id} type="button" onClick={() => onJump(c)}
          className="flex flex-col gap-1 rounded-[10px] border border-line p-3 text-left hover:border-line-strong">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="rounded bg-bug-soft px-1.5 py-px font-mono font-medium text-ink">{formatRanges(c.ranges)}</span>
            {c.function && <span className="font-mono">{c.function}</span>}
            {c.type === 'bug'
              ? <span>· {c.severity && LABEL[c.severity]} · {c.confidence && LABEL[c.confidence]}</span>
              : <span>· {LABEL[c.type]}</span>}
          </div>
          <div className="line-clamp-3 leading-[1.45]">{c.text}</div>
        </button>
      ))}
    </>
  )
}

function ImprovementList({ items, onChange }: { items: Improvement[]; onChange: (items: Improvement[]) => void }) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const add = () => {
    if (!title.trim()) return
    onChange([...items, { id: `i${Date.now().toString(36)}`, title: title.trim(), detail: detail.trim() }])
    setTitle('')
    setDetail('')
  }
  return (
    <>
      {items.map((it) => (
        <div key={it.id} className="flex gap-3 rounded-[10px] border border-line p-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{it.title}</div>
            {it.detail && <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-[1.45] text-muted">{it.detail}</div>}
          </div>
          <button type="button" className="self-start text-xs font-medium text-accent hover:underline"
            onClick={() => onChange(items.filter((x) => x.id !== it.id))}>Remove</button>
        </div>
      ))}
      <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
        <label htmlFor="impr-title" className="text-xs text-muted">Suggest an improvement</label>
        <input id="impr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Factor out a remove_entry() helper"
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="h-[34px] rounded-lg border border-line-strong px-2.5 outline-none focus:border-accent" />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Why, and what would it fix? (optional)" aria-label="Improvement detail"
          className="h-[72px] resize-y rounded-lg border border-line-strong p-2.5 leading-[1.45] outline-none focus:border-accent" />
        <button type="button" onClick={add} disabled={!title.trim()}
          className="h-8 self-end rounded-lg bg-accent px-3.5 font-semibold text-white disabled:opacity-40">Add</button>
      </div>
    </>
  )
}

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  questions: { id: string; text: string }[]
  prompts: { id: string; text: string }[]
  comprehension: Record<string, string>
  design: Record<string, string>
  comments: CodeComment[]
  improvements: Improvement[]
  functions: OutlineFunction[]
  onAnswer: (section: 'comprehension' | 'design', id: string, text: string) => void
  onImprovements: (items: Improvement[]) => void
  onJump: (line: number) => void
  onReview: () => void
}

export function SidePanel(p: Props) {
  const answered = (rec: Record<string, string>, ids: { id: string }[]) => ids.filter((q) => rec[q.id]?.trim()).length
  const bugs = p.comments.filter((c) => c.type === 'bug')
  const others = p.comments.filter((c) => c.type !== 'bug')
  const improveCount = p.improvements.length + p.comments.filter((c) => c.type === 'improvement').length
  const count: Record<Tab, string> = {
    understand: `${answered(p.comprehension, p.questions)}/${p.questions.length}`,
    bugs: `${bugs.length}`,
    design: `${answered(p.design, p.prompts)}/${p.prompts.length}`,
    improve: `${improveCount}`,
  }
  const jumpTo = (c: CodeComment) => p.onJump(c.ranges[0].start_line)
  const next = TABS[TABS.indexOf(p.tab) + 1]

  return (
    <section className="flex w-[416px] flex-none flex-col border-l border-line bg-white">
      <div role="tablist" className="flex border-b border-line px-2">
        {TABS.map((t) => (
          <button key={t} role="tab" type="button" aria-selected={p.tab === t} onClick={() => p.onTab(t)}
            className={`border-b-2 px-2.5 pb-3 pt-3.5 text-[13px] ${p.tab === t ? 'border-accent font-semibold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}>
            {TAB_LABEL[t]} <span className="font-medium text-muted">{count[t]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {p.tab === 'understand' && (
          <>
            <Heading title="Understand the code" sub="Answer in your own words. You can jump to the code at any time." />
            <PromptList items={p.questions} answers={p.comprehension} functions={p.functions} onJump={p.onJump}
              onAnswer={(id, t) => p.onAnswer('comprehension', id, t)} />
          </>
        )}
        {p.tab === 'bugs' && (
          <>
            <Heading title="Bugs you found" sub="Each bug is a comment anchored to lines in the code. Click one to jump to it." />
            <CommentList comments={bugs} onJump={jumpTo}
              empty={<>No bugs yet. Drag across line numbers in the code to select the lines involved, then choose <b>Bug</b> and explain what goes wrong and why.</>} />
            {others.length > 0 && (
              <>
                <div className="mt-2 text-[11px] font-semibold tracking-[0.06em] text-muted">OTHER COMMENTS</div>
                <CommentList comments={others} onJump={jumpTo} empty={null} />
              </>
            )}
          </>
        )}
        {p.tab === 'design' && (
          <>
            <Heading title="Discuss the design" sub="There is rarely one right answer. Explain the trade-offs." />
            <PromptList items={p.prompts} answers={p.design} functions={p.functions} onJump={p.onJump}
              onAnswer={(id, t) => p.onAnswer('design', id, t)} />
          </>
        )}
        {p.tab === 'improve' && (
          <>
            <Heading title="Suggest improvements" sub="How would you make this code better beyond fixing bugs: structure, testing, API, performance?" />
            <ImprovementList items={p.improvements} onChange={p.onImprovements} />
            {p.comments.some((c) => c.type === 'improvement') && (
              <>
                <div className="mt-2 text-[11px] font-semibold tracking-[0.06em] text-muted">FROM YOUR CODE COMMENTS</div>
                <CommentList comments={p.comments.filter((c) => c.type === 'improvement')} onJump={jumpTo} empty={null} />
              </>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <span className="text-xs text-muted">Answers autosave</span>
        {next ? (
          <button type="button" onClick={() => p.onTab(next)} className="h-[34px] rounded-lg bg-accent px-3.5 font-semibold text-white">
            Next: {TAB_LABEL[next]} →
          </button>
        ) : (
          <button type="button" onClick={p.onReview} className="h-[34px] rounded-lg bg-accent px-3.5 font-semibold text-white">
            Review and submit →
          </button>
        )}
      </div>
    </section>
  )
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <div className="text-[15px] font-semibold">{title}</div>
      <div className="mt-0.5 text-[12.5px] leading-[1.45] text-muted">{sub}</div>
    </div>
  )
}
