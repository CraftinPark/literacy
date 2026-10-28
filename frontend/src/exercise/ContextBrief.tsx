import { useState } from 'react'
import type { Brief } from '../lib/types'

/** What the code is for and the constraints it was built under. Collapsible where it is a reminder. */
export function ContextBrief({ brief, collapsible = false }: { brief: Brief; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible)
  const body = (
    <div className="flex flex-col gap-2.5">
      <p className="text-[14px] leading-[1.6] text-ink/85">{brief.purpose}</p>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Built under these constraints</span>
        <ul className="ml-4 flex list-disc flex-col gap-1 text-[13.5px] leading-[1.5] text-ink/85">
          {brief.constraints.map((c, i) => <li key={i} className="pl-1">{c}</li>)}
        </ul>
      </div>
    </div>
  )
  if (!collapsible) {
    return (
      <section className="flex flex-col gap-2" aria-label="Context">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted">CONTEXT</span>
        {body}
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-2 rounded-[10px] bg-surface p-3.5" aria-label="Context">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex items-center justify-between text-left text-[13px] font-semibold text-ink">
        Context: what this code is for
        <span className="text-xs font-medium text-accent-text">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && body}
    </section>
  )
}
