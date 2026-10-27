import { useEffect, useRef, useState } from 'react'
import { COMMENT_HUE, HUE_STRIPE, HUE_TEXT } from '../lib/hues'
import type { CodeComment, CommentType } from '../lib/types'
import { COMMENT_TYPES, CONFIDENCES, LABEL, SEVERITIES, formatRanges } from '../lib/types'

const PROMPT: Record<CommentType, string> = {
  bug: 'What is wrong, and why does it fail?',
  question: 'What would you like to know about this code?',
  design: 'What is the design concern?',
  improvement: 'What would you improve, and why?',
}

function Pill({ on, onClick, children, tone = 'dark', size = 'md' }: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'dark' | 'danger'
  size?: 'md' | 'sm'
}) {
  const active = tone === 'danger' ? 'border-danger bg-danger text-white font-semibold' : 'border-ink bg-ink text-surface font-semibold'
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-md border text-xs ${size === 'md' ? 'px-3 py-[5px]' : 'px-[9px] py-1'} ${on ? active : 'border-transparent bg-chip font-medium text-ink hover:bg-track'}`}>
      {children}
    </button>
  )
}

export interface DraftState {
  comment: CodeComment
  editingId: string | null
  linking: boolean
}

export function canSave(c: CodeComment) {
  return c.text.trim().length > 0 && (c.type !== 'bug' || (!!c.severity && !!c.confidence))
}

export function Composer({ draft, onChange, onSave, onCancel, onToggleLink }: {
  draft: DraftState
  onChange: (c: CodeComment) => void
  onSave: () => void
  onCancel: () => void
  onToggleLink: () => void
}) {
  const c = draft.comment
  const [showFix, setShowFix] = useState(!!c.fix)
  const text = useRef<HTMLTextAreaElement>(null)
  useEffect(() => text.current?.focus(), [])
  const set = (patch: Partial<CodeComment>) => onChange({ ...c, ...patch })
  const ok = canSave(c)

  return (
    <div className="mb-3 ml-[72px] mr-6 mt-2.5 max-w-[640px] rounded-[10px] bg-surface px-4 py-3.5 ring-1 ring-bug/50 font-sans text-[13px] text-ink shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ok) onSave()
      }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-semibold">{draft.editingId ? 'Edit comment' : 'New comment'}</span>
        <span className="flex flex-wrap justify-end gap-1">
          {c.ranges.map((r, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-bug-soft px-2 py-0.5 font-mono text-xs font-medium">
              {formatRanges([r])}{i === 0 && c.function ? ` · ${c.function}` : ''}
              {c.ranges.length > 1 && (
                <button type="button" aria-label="Remove range" className="text-muted hover:text-ink"
                  onClick={() => set({ ranges: c.ranges.filter((_, j) => j !== i) })}>×</button>
              )}
            </span>
          ))}
        </span>
      </div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {COMMENT_TYPES.map((t) => (
          <Pill key={t} on={c.type === t} tone={t === 'bug' ? 'danger' : 'dark'} onClick={() => set({ type: t })}>{LABEL[t]}</Pill>
        ))}
      </div>
      {c.type === 'bug' && (
        <div className="mb-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="mr-0.5 text-xs text-muted">Severity</span>
            {SEVERITIES.map((s) => <Pill key={s} size="sm" on={c.severity === s} onClick={() => set({ severity: s })}>{LABEL[s]}</Pill>)}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="mr-0.5 text-xs text-muted">Confidence</span>
            {CONFIDENCES.map((s) => <Pill key={s} size="sm" on={c.confidence === s} onClick={() => set({ confidence: s })}>{LABEL[s]}</Pill>)}
          </div>
        </div>
      )}
      <label htmlFor="composer-text" className="mb-1 block text-xs text-muted">{PROMPT[c.type]}</label>
      <textarea id="composer-text" ref={text} value={c.text} onChange={(e) => set({ text: e.target.value })}
        className="h-[78px] w-full resize-y rounded-md bg-field px-2.5 py-2 leading-[1.45] text-ink outline-none ring-accent focus:ring-1" />
      {c.type === 'bug' && showFix && (
        <>
          <label htmlFor="composer-fix" className="mb-1 mt-2 block text-xs text-muted">Suggested fix</label>
          <textarea id="composer-fix" value={c.fix ?? ''} onChange={(e) => set({ fix: e.target.value })}
            className="h-[60px] w-full resize-y rounded-md bg-field px-2.5 py-2 leading-[1.45] text-ink outline-none ring-accent focus:ring-1" />
        </>
      )}
      {draft.linking && (
        <p className="mt-2 rounded-md bg-bug-soft px-2.5 py-1.5 text-xs">
          Select another range in the line numbers to link it to this comment.
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="flex gap-3.5 text-xs">
          {c.type === 'bug' && !showFix && (
            <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => setShowFix(true)}>+ Suggest a fix</button>
          )}
          <button type="button" className="font-medium text-accent-text hover:underline" onClick={onToggleLink}>
            {draft.linking ? 'Stop linking' : '+ Link another range'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!ok && c.text.trim() && c.type === 'bug' && <span className="text-xs text-muted">Pick severity and confidence</span>}
          <button type="button" onClick={onCancel} className="h-8 rounded-lg bg-chip px-3 font-medium hover:bg-track">Cancel</button>
          <button type="button" onClick={onSave} disabled={!ok}
            className="h-8 rounded-lg bg-accent px-3.5 font-semibold text-accent-on disabled:cursor-not-allowed disabled:opacity-40">
            Save comment
          </button>
        </div>
      </div>
    </div>
  )
}

export function CommentCard({ c, onEdit, onDelete }: { c: CodeComment; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const meta = ['You', LABEL[c.type], c.type === 'bug' && c.severity && LABEL[c.severity],
    c.type === 'bug' && c.confidence && LABEL[c.confidence], formatRanges(c.ranges)].filter(Boolean).join(' · ')
  return (
    <div className={`my-2 ml-[72px] mr-6 flex max-w-[640px] gap-3 border-l-2 ${HUE_STRIPE[COMMENT_HUE[c.type]]} bg-code-note-bg/60 px-3.5 py-2.5 font-sans text-[13px] leading-[1.45] text-code-text`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true" className={`mt-0.5 flex-none ${HUE_TEXT[COMMENT_HUE[c.type]]}`}>
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-xs text-code-dim">{meta}</div>
        <div className="whitespace-pre-wrap">{c.text}</div>
        {c.fix && <div className="mt-1 whitespace-pre-wrap text-code-dim"><span className="text-code-text">Fix: </span>{c.fix}</div>}
      </div>
      <div className="flex items-start gap-3 text-xs font-medium text-code-note-text">
        {confirming ? (
          <>
            <span className="text-code-dim">Delete?</span>
            <button type="button" className="hover:underline" onClick={onDelete}>Yes</button>
            <button type="button" className="hover:underline" onClick={() => setConfirming(false)}>No</button>
          </>
        ) : (
          <>
            <button type="button" className="hover:underline" onClick={onEdit}>Edit</button>
            <button type="button" className="hover:underline" onClick={() => setConfirming(true)}>Delete</button>
          </>
        )}
      </div>
    </div>
  )
}
