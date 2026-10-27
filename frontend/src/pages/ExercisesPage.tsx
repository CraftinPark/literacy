import { useEffect, useState } from 'react'
import { ConceptTags } from '../components/ConceptTags'
import { Logo } from '../components/Logo'
import { hasProgress } from '../lib/storage'
import type { ExerciseSummary } from '../lib/types'
import { languageLabel } from '../lib/types'

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
      <header className="flex h-14 items-center bg-canvas px-5"><Logo /></header>
      <div className="mx-auto max-w-[880px] px-4 py-10">
        <h1 className="text-xl font-semibold">Exercises</h1>
        <p className="mt-1 text-muted">Real open-source code with a bug added. Read it, find what's wrong, and explain the design.</p>
        {error && <p className="mt-6 rounded-lg bg-surface p-4 text-danger">{error}</p>}
        {!list && !error && <p className="mt-6 text-muted">Loading…</p>}
        <div className="mt-6 flex flex-col gap-3">
          {list?.map((e) => {
            const started = hasProgress(e.id, e.version)
            return (
              <a key={e.id} href={`#/exercise/${e.id}`}
                className="group flex flex-wrap items-center gap-4 rounded-[10px] bg-surface p-5 hover:bg-chip">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{e.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    Exercise {e.id.replace(/^readcode-/, '')} · {languageLabel(e.language)} · {e.line_count} lines · <span className="capitalize">{e.level}</span> · about {e.estimated_minutes} min
                  </div>
                  <ConceptTags concepts={e.concepts} withArea className="mt-3" />
                </div>
                <span className="flex h-9 items-center rounded-lg bg-accent px-4 font-semibold text-accent-on">
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
