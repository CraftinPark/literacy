import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import { hasProgress } from '../lib/storage'
import type { ExerciseSummary } from '../lib/types'

export default function ExercisesPage() {
  const [list, setList] = useState<ExerciseSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/exercises/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('The exercise list is missing. Run `npm run sync`.'))))
      .then(setList)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center border-b border-line bg-white px-5"><Logo /></header>
      <div className="mx-auto max-w-[880px] px-4 py-10">
        <h1 className="text-xl font-semibold">Exercises</h1>
        <p className="mt-1 text-muted">Real code with seeded bugs. Read it, find what's wrong, and explain the design.</p>
        {error && <p className="mt-6 rounded-lg border border-line bg-white p-4 text-danger">{error}</p>}
        {!list && !error && <p className="mt-6 text-muted">Loading…</p>}
        <div className="mt-6 flex flex-col gap-3">
          {list?.map((e) => {
            const started = hasProgress(e.id, e.version)
            return (
              <a key={e.id} href={`#/exercise/${e.id}`}
                className="group flex flex-wrap items-center gap-4 rounded-[10px] border border-line bg-white p-4 hover:border-accent hover:shadow-[0_2px_10px_rgba(31,79,216,0.12)]">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{e.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    Exercise {e.id.replace(/^readcode-/, '')} · {e.language === 'c' ? 'C' : e.language} · {e.line_count} lines · <span className="capitalize">{e.difficulty}</span> · about {e.estimated_minutes} min
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.topics.map((t) => <span key={t} className="rounded bg-chip px-2 py-0.5 text-xs text-muted">{t}</span>)}
                  </div>
                </div>
                <span className="flex h-9 items-center rounded-lg bg-accent px-4 font-semibold text-white">
                  {started ? 'Continue' : 'Start'} →
                </span>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
