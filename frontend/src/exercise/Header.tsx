import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import type { PublicExercise } from '../lib/types'

/** Soft countdown from the exercise's estimate. Turns red when over; never forces a submit. */
function Timer({ startedAt, minutes }: { startedAt: number; minutes: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.round((startedAt + minutes * 60_000 - now) / 1000)
  const abs = Math.abs(left)
  const text = `${left < 0 ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  return (
    <span className={`font-mono text-sm font-medium ${left < 0 ? 'text-danger' : ''}`}
      title={left < 0 ? 'Over the suggested time. Keep going; nothing is cut off.' : `Suggested time: ${minutes} minutes`}>
      {text}
    </span>
  )
}

export function Header({ ex, lines, answeredCount, totalPrompts, commentCount, startedAt, onSubmit }: {
  ex: PublicExercise
  lines: number
  answeredCount: number
  totalPrompts: number
  commentCount: number
  startedAt: number
  onSubmit: () => void
}) {
  const pct = totalPrompts ? Math.round((answeredCount / totalPrompts) * 100) : 0
  const number = ex.id.replace(/^readcode-/, '')
  return (
    <header className="flex h-14 flex-none items-center gap-5 border-b border-line bg-white px-5">
      <Logo />
      <div className="h-6 w-px bg-line" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{ex.title}</span>
        <span className="text-xs text-muted">
          Exercise {number} · {ex.language === 'c' ? 'C' : ex.language} · {lines} lines · <span className="capitalize">{ex.difficulty}</span>
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 text-xs text-muted">
        <span>{answeredCount} of {totalPrompts} answered · {commentCount} comment{commentCount === 1 ? '' : 's'}</span>
        <div className="h-1.5 w-[140px] rounded-[3px] bg-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-1.5 rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Timer startedAt={startedAt} minutes={ex.estimated_minutes} />
      <button type="button" onClick={onSubmit} className="h-9 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-[#1a44bd]">
        Submit for review
      </button>
    </header>
  )
}
