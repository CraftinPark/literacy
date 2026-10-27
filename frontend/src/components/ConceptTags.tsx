import { useLayoutEffect, useRef, useState } from 'react'
import type { Concept } from '../lib/types'
import { conceptArea } from '../lib/types'

const TAG =
  'flex h-6 cursor-default items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong px-2 text-[12.5px] ' +
  'text-ink/90 transition-colors hover:border-accent-text/60 hover:bg-chip hover:text-ink'
const GAP = 6 // gap-1.5
const MORE_WIDTH = 40 // room kept for the "+N" tag

/**
 * The concepts an exercise practises, as outlined tags. `withArea` prefixes the area in small caps
 * (roomy layouts); otherwise the area and id are in the tooltip. With `oneRow`, tags that don't fit
 * collapse into a "+N" tag whose tooltip names them. Tags are not links yet: a concept page (all
 * examples for that concept) would hang off them later.
 */
export function ConceptTags({ concepts, withArea = false, oneRow = false, className = '' }: {
  concepts: Concept[]
  withArea?: boolean
  oneRow?: boolean
  className?: string
}) {
  const ref = useRef<HTMLUListElement>(null)
  const [shown, setShown] = useState(concepts.length)

  useLayoutEffect(() => {
    const el = ref.current
    if (!oneRow || !el) return
    const measure = () => {
      // Hidden tags stay in the DOM (absolutely positioned, invisible), so every width can be read.
      const widths = [...el.querySelectorAll<HTMLElement>('[data-tag]')].map((t) => t.offsetWidth)
      const room = el.clientWidth
      const total = widths.reduce((s, w) => s + w, 0) + GAP * (widths.length - 1)
      if (total <= room) return setShown(widths.length)
      let used = 0
      let n = 0
      while (n < widths.length && used + widths[n] + GAP + MORE_WIDTH <= room) used += widths[n++] + GAP
      setShown(n)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [oneRow, concepts])

  const hidden = concepts.slice(shown)
  return (
    <ul ref={ref} className={`relative flex gap-1.5 ${oneRow ? 'min-w-0 overflow-hidden' : 'flex-wrap'} ${className}`}
      aria-label="Concepts practised">
      {concepts.map((c, i) => (
        <li key={c.id} data-tag title={`${conceptArea(c.id)} · ${c.id}`}
          className={`${TAG} ${i >= shown ? 'invisible absolute' : ''}`} aria-hidden={i >= shown || undefined}>
          {withArea && <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{conceptArea(c.id)}</span>}
          {c.name}
        </li>
      ))}
      {hidden.length > 0 && (
        <li className={`${TAG} text-muted`} title={hidden.map((c) => c.name).join(', ')}
          aria-label={`${hidden.length} more: ${hidden.map((c) => c.name).join(', ')}`}>
          +{hidden.length}
        </li>
      )}
    </ul>
  )
}
