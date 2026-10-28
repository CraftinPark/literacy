import { useState } from 'react'
import type { QuestionScore } from '../lib/score'
import type { Hint, QuestionResult, Reveal } from '../lib/types'

/** Hints that open one at a time, each after confirming its cost. */
export function HintList({ hints, used, onOpen }: { hints: Hint[]; used: number; onOpen: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (!hints.length) return null
  const next = hints[used]
  const spent = hints.slice(0, used).reduce((n, h) => n + h.cost, 0)
  const pts = (n: number) => `${n} point${n === 1 ? '' : 's'}`
  return (
    <div className="flex flex-col gap-2">
      {hints.slice(0, used).map((h) => (
        <div key={h.level} className="flex gap-2.5 text-[13.5px] leading-[1.5]">
          <span className="flex-none font-semibold text-sec-bugs">Hint{hints.length > 1 ? ` ${h.level}` : ''}</span>
          <span className="text-ink/90">{h.text}</span>
        </div>
      ))}
      {next ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {confirming ? (
            <>
              <span className="text-muted">This hint costs {pts(next.cost)}.</span>
              <button type="button" onClick={() => { setConfirming(false); onOpen() }}
                className="rounded-md bg-chip px-2.5 py-1 font-medium text-ink hover:bg-track">Open it</button>
              <button type="button" onClick={() => setConfirming(false)} className="px-1 text-muted hover:text-ink">Not yet</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}
              className="rounded-md bg-chip px-2.5 py-1 font-medium text-ink hover:bg-track">
              {used === 0 ? 'Stuck? Open a hint' : 'Open the next hint'}
              <span className="ml-1.5 text-muted">−{next.cost}</span>
            </button>
          )}
          {spent > 0 && hints.length > 1 && <span className="text-muted">Hints used: {used} of {hints.length} (−{spent})</span>}
        </div>
      ) : (
        spent > 0 && <span className="text-[13px] text-muted">{hints.length > 1 ? 'All hints open' : 'Hint used'} (−{spent}).</span>
      )}
    </div>
  )
}

/**
 * After a question is submitted or conceded: the answer's points. Submitted answers are self-checked by
 * ticking the points they covered; conceded ones just show the answer. Answers that would give the bug
 * away wait until the bug question is done.
 */
export function AnswerPanel({ points, result, score, revealed, onTick }: {
  points: Reveal['answers'][string]
  result: QuestionResult
  score: QuestionScore
  revealed: boolean
  onTick: (pointId: string) => void
}) {
  if (!revealed) {
    return (
      <p className="rounded-md bg-field px-3 py-2.5 text-[13px] leading-[1.5] text-muted">
        Your answer is saved. Its answer is shown once you have done the bug question, because it would give the bug away.
      </p>
    )
  }
  const self = result.state === 'submitted'
  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] bg-surface p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{self ? 'Check your answer' : 'The answer'}</span>
        <span className="text-xs text-muted">
          {self ? `${score.points} of ${score.requiredTotal} points` : 'Conceded · 0 points'}
          {score.hintCost > 0 && self ? ` (hints −${score.hintCost})` : ''}
        </span>
      </div>
      {self && <p className="text-xs leading-[1.45] text-muted">Tick each point your answer covered. Be strict: close counts, vague does not.</p>}
      <ul className="flex flex-col gap-2">
        {points.map((p) => (
          <li key={p.id} className="flex gap-2.5 text-[13.5px] leading-[1.5]">
            {self ? (
              <input type="checkbox" id={`tick-${p.id}`} checked={result.ticked.includes(p.id)} onChange={() => onTick(p.id)}
                className="mt-1 h-3.5 w-3.5 flex-none accent-[rgb(var(--c-accent))]" />
            ) : (
              <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-muted" />
            )}
            <label htmlFor={`tick-${p.id}`} className="text-ink/90">
              {p.point}
              {p.kind === 'bonus' && <span className="ml-1.5 rounded bg-chip px-1.5 py-px text-[11px] font-medium text-muted">bonus</span>}
            </label>
          </li>
        ))}
      </ul>
      {!self && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[13px]">
          <button type="button" disabled title="Coming soon: the same code with a different bug, to try again"
            className="cursor-not-allowed rounded-md bg-chip px-2.5 py-1 font-medium text-muted">Try a variant</button>
          <span className="text-xs text-muted">Coming soon: the same code with a different problem, to try again.</span>
        </div>
      )}
    </div>
  )
}
