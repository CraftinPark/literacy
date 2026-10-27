import { useState } from 'react'
import type { ReactNode } from 'react'
import type { OutlineFunction } from '../lib/outline'
import { COMMENT_HUE, HUE_BG, HUE_STRIPE, HUE_TEXT } from '../lib/hues'
import type { Hue } from '../lib/hues'
import type { CodeComment, Dimension, Improvement, Question } from '../lib/types'
import { LABEL, formatRanges } from '../lib/types'

export type Tab = Hue
const TABS: Tab[] = ['understand', 'bugs', 'design', 'improve']
const TAB_LABEL: Record<Tab, string> = { understand: 'Understand', bugs: 'Bugs', design: 'Design', improve: 'Improve' }
const DIMENSION: Record<Tab, Dimension> = { understand: 'understanding', bugs: 'bugs', design: 'design', improve: 'improvements' }

type JumpFn = (file: string, line: number) => void
type FileFunction = OutlineFunction & { file: string }

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
const FIELD = 'w-full rounded-md bg-field px-3 py-2.5 leading-normal outline-none ring-accent focus:ring-1'

/** Render function names that appear in a prompt as code chips. */
function PromptText({ text, fnNames }: { text: string; fnNames: string[] }) {
  if (!fnNames.length) return <>{text}</>
  const re = new RegExp(`\\b(${fnNames.join('|')})\\b`, 'g')
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) => i % 2 ? (
        <span key={i} className="rounded bg-chip px-[5px] py-px font-mono text-[13.5px] font-medium">{p}</span>
      ) : p)}
    </>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CC38A" strokeWidth="2.4" strokeLinecap="round"
      strokeLinejoin="round" role="img" aria-label="Answered" className="mt-[3px] flex-none">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

function SectionLabel({ hue, children }: { hue: Hue; children: ReactNode }) {
  return <div className={`text-[11px] font-semibold tracking-[0.08em] ${HUE_TEXT[hue]}`}>{children}</div>
}

/** Questions as numbered paragraphs; the open one shows its answer field. Numbers take the tab's hue. */
function PromptList({ items, answers, onAnswer, functions, onJump, hue }: {
  items: Question[]
  answers: Record<string, string>
  onAnswer: (id: string, text: string) => void
  functions: FileFunction[]
  onJump: JumpFn
  hue: Hue
}) {
  const [active, setActive] = useState<string | null>(() => items.find((q) => !answers[q.id]?.trim())?.id ?? null)
  // Plain-word method names (run, close, start) would match ordinary English, so only
  // camelCase or snake_case names, or any name written as a call, count as code.
  const isCode = (name: string, text: string) => /[A-Z_]/.test(name) || new RegExp(`\\b${name}\\(`).test(text)
  return (
    <ol className="flex flex-col gap-6">
      {items.map((q, i) => {
        const answer = answers[q.id] ?? ''
        const done = answer.trim().length > 0
        const open = active === q.id
        const names = [...new Set(functions.filter((f) => isCode(f.name, q.text)).map((f) => f.name))]
        const mentioned = functions.find((f) => names.includes(f.name) && new RegExp(`\\b${f.name}\\b`).test(q.text))
        const number = done && !open
          ? <CheckIcon />
          : <span className={`w-6 flex-none font-mono text-[15px] font-semibold leading-[1.45] ${HUE_TEXT[hue]}`}>{i + 1}</span>
        if (open) {
          return (
            <li key={q.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                {number}
                <div className="text-[15.5px] font-semibold leading-[1.45] text-ink"><PromptText text={q.text} fnNames={names} /></div>
              </div>
              <div className="ml-9 flex flex-col gap-2">
                {mentioned && (
                  <button type="button" onClick={() => onJump(mentioned.file, mentioned.line)}
                    className="self-start text-[13px] font-medium text-accent-text hover:underline">
                    Jump to {mentioned.name} · line {mentioned.line} →
                  </button>
                )}
                <label htmlFor={`ans-${q.id}`} className="sr-only">Your answer</label>
                <textarea id={`ans-${q.id}`} autoFocus value={answer} onChange={(e) => onAnswer(q.id, e.target.value)}
                  placeholder="Your answer" className={`h-[150px] resize-y ${FIELD}`} />
                <div className="flex justify-between text-xs text-muted">
                  <span>{wordCount(answer)} words · Autosaved</span>
                  <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => setActive(null)}>Done</button>
                </div>
              </div>
            </li>
          )
        }
        return (
          <li key={q.id}>
            <button type="button" onClick={() => setActive(q.id)} className="group flex w-full flex-col gap-1 text-left">
              <div className="flex items-start gap-3">
                {number}
                <div>
                  <div className="text-[15.5px] font-medium leading-[1.45] text-ink/85 group-hover:text-ink">
                    <PromptText text={q.text} fnNames={names} />
                  </div>
                  {done
                    ? <div className="mt-1 line-clamp-2 text-[13.5px] leading-[1.5] text-muted">{answer}</div>
                    : <div className="mt-0.5 text-[13px] text-muted">Not answered</div>}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function CommentList({ comments, onJump, empty, withFile }: {
  comments: CodeComment[]
  onJump: (c: CodeComment) => void
  empty: ReactNode
  withFile: boolean
}) {
  if (!comments.length) return <p className="text-[13.5px] leading-[1.5] text-muted">{empty}</p>
  return (
    <div className="flex flex-col gap-4">
      {comments.map((c) => (
        <button key={c.id} type="button" onClick={() => onJump(c)}
          className={`flex flex-col gap-1 border-l-2 pl-3 text-left ${HUE_STRIPE[COMMENT_HUE[c.type]]} hover:bg-surface`}>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="rounded bg-chip px-1.5 py-px font-mono font-medium text-ink">{formatRanges(c.ranges, withFile)}</span>
            {c.function && <span className="font-mono">{c.function}</span>}
            {c.type === 'bug'
              ? <span>· {c.severity && LABEL[c.severity]} · {c.confidence && LABEL[c.confidence]}</span>
              : <span>· {LABEL[c.type]}</span>}
          </div>
          <div className="line-clamp-3 text-[14px] leading-[1.5]">{c.text}</div>
        </button>
      ))}
    </div>
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
    <div className="flex flex-col gap-4">
      {items.map((it) => (
        <div key={it.id} className={`flex gap-3 border-l-2 pl-3 ${HUE_STRIPE.improve}`}>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">{it.title}</div>
            {it.detail && <div className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-[1.5] text-muted">{it.detail}</div>}
          </div>
          <button type="button" className="self-start text-xs font-medium text-accent-text hover:underline"
            onClick={() => onChange(items.filter((x) => x.id !== it.id))}>Remove</button>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <label htmlFor="impr-title" className="sr-only">Suggest an improvement</label>
        <input id="impr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Suggest an improvement, e.g. factor out the repeated retry blocks"
          onKeyDown={(e) => e.key === 'Enter' && add()} className={FIELD} />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Why, and what would it fix? (optional)" aria-label="Improvement detail"
          className={`h-[72px] resize-y ${FIELD}`} />
        <button type="button" onClick={add} disabled={!title.trim()}
          className="h-8 self-end rounded-lg bg-accent px-3.5 font-semibold text-accent-on disabled:opacity-40">Add</button>
      </div>
    </div>
  )
}

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  intro?: string
  questions: Question[]
  answers: Record<string, string>
  comments: CodeComment[]
  improvements: Improvement[]
  functions: FileFunction[]
  multiFile: boolean
  onAnswer: (id: string, text: string) => void
  onImprovements: (items: Improvement[]) => void
  onJump: JumpFn
  onReview: () => void
}

export function SidePanel(p: Props) {
  const of = (t: Tab) => p.questions.filter((q) => q.dimension === DIMENSION[t])
  const answered = (t: Tab) => of(t).filter((q) => p.answers[q.id]?.trim()).length
  const bugs = p.comments.filter((c) => c.type === 'bug')
  const others = p.comments.filter((c) => c.type !== 'bug')
  const improveCount = p.improvements.length + p.comments.filter((c) => c.type === 'improvement').length
  const count: Record<Tab, string> = {
    understand: `${answered('understand')}/${of('understand').length}`,
    bugs: `${bugs.length}`,
    design: `${answered('design')}/${of('design').length}`,
    improve: of('improve').length ? `${answered('improve')}/${of('improve').length}` : `${improveCount}`,
  }
  const jumpTo = (c: CodeComment) => p.onJump(c.ranges[0].file, c.ranges[0].start_line)
  const next = TABS[TABS.indexOf(p.tab) + 1]
  const prompts = (t: Tab) => of(t).length > 0 && (
    <PromptList key={t} items={of(t)} answers={p.answers} functions={p.functions} onJump={p.onJump} onAnswer={p.onAnswer} hue={t} />
  )

  return (
    <section className="flex w-[416px] flex-none flex-col bg-canvas">
      <div role="tablist" className="flex justify-between px-4">
        {TABS.map((t) => {
          const on = p.tab === t
          return (
            <button key={t} role="tab" type="button" aria-selected={on} onClick={() => p.onTab(t)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-1.5 pb-3 pt-4 text-[14px] ${on ? `font-semibold ${HUE_TEXT[t]}` : 'font-medium text-muted hover:text-ink'}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${HUE_BG[t]} ${on ? '' : 'opacity-50'}`} />
              {TAB_LABEL[t]} <span className="font-normal text-muted">{count[t]}</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 pb-8 pt-3">
        {p.tab === 'understand' && (
          <>
            {p.intro && <p className="text-[14px] leading-[1.6] text-ink/75">{p.intro}</p>}
            <Heading title="Understand the code" sub="Answer in your own words. You can jump to the code at any time." />
            {prompts('understand')}
          </>
        )}
        {p.tab === 'bugs' && (
          <>
            <Heading title="Find bugs" sub="Answer below, and anchor each bug you find to the lines involved with a code comment." />
            {prompts('bugs')}
            <div className="flex flex-col gap-3">
              <SectionLabel hue="bugs">BUGS YOU FOUND</SectionLabel>
              <CommentList comments={bugs} onJump={jumpTo} withFile={p.multiFile}
                empty={<>None yet. Drag across line numbers in the code to select the lines involved, then choose <b className="font-semibold text-ink">Bug</b> and explain what goes wrong and why.</>} />
            </div>
            {others.length > 0 && (
              <div className="flex flex-col gap-3">
                <SectionLabel hue="bugs">OTHER COMMENTS</SectionLabel>
                <CommentList comments={others} onJump={jumpTo} empty={null} withFile={p.multiFile} />
              </div>
            )}
          </>
        )}
        {p.tab === 'design' && (
          <>
            <Heading title="Discuss the design" sub="There is rarely one right answer. Explain the trade-offs." />
            {prompts('design')}
          </>
        )}
        {p.tab === 'improve' && (
          <>
            <Heading title="Suggest improvements" sub="How would you make this code better beyond fixing bugs: structure, testing, API, performance?" />
            {prompts('improve')}
            <div className="flex flex-col gap-3">
              {of('improve').length > 0 && <SectionLabel hue="improve">ANYTHING ELSE</SectionLabel>}
              <ImprovementList items={p.improvements} onChange={p.onImprovements} />
            </div>
            {p.comments.some((c) => c.type === 'improvement') && (
              <div className="flex flex-col gap-3">
                <SectionLabel hue="improve">FROM YOUR CODE COMMENTS</SectionLabel>
                <CommentList comments={p.comments.filter((c) => c.type === 'improvement')} onJump={jumpTo} empty={null} withFile={p.multiFile} />
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-xs text-muted">Answers autosave</span>
        {next ? (
          <button type="button" onClick={() => p.onTab(next)} className="h-[34px] rounded-lg bg-accent px-3.5 font-semibold text-accent-on hover:bg-accent-hover">
            Next: {TAB_LABEL[next]} →
          </button>
        ) : (
          <button type="button" onClick={p.onReview} className="h-[34px] rounded-lg bg-accent px-3.5 font-semibold text-accent-on hover:bg-accent-hover">
            Review and submit →
          </button>
        )}
      </div>
    </section>
  )
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h2>
      <p className="text-[14px] leading-[1.5] text-muted">{sub}</p>
    </div>
  )
}
