import { Fragment, memo, useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import type { ReactNode } from 'react'
import type { Token, TokenKind } from '../lib/highlight'

const TOKEN_CLASS: Record<TokenKind, string> = {
  kw: 'text-code-kw',
  const: 'text-code-const',
  num: 'text-code-const',
  str: 'text-code-str',
  com: 'text-code-com',
  pre: 'text-code-pre',
  plain: '',
}

export type LineMark = 'draft' | 'saved' | undefined

export interface CodePaneHandle {
  scrollToLine: (line: number) => void
}

interface Props {
  path: string
  linking: boolean
  tokens: Token[][]
  marks: Map<number, LineMark>
  inserts: Map<number, ReactNode>          // rendered after the given line
  focusLines: Set<number> | null           // null = show every line
  searchHits: Set<number>
  activeHit: number | null
  breadcrumb: string | undefined
  onSelect: (start: number, end: number) => void
  onTopLineChange: (line: number) => void
  onShowAll: () => void
  focus: boolean
  canFocus: boolean
  onToggleFocus: () => void
}

const Row = memo(function Row({ n, tokens, mark, hit, active, selecting, onDown, onEnter }: {
  n: number
  tokens: Token[]
  mark: LineMark
  hit: boolean
  active: boolean
  selecting: boolean
  onDown: (n: number, shift: boolean) => void
  onEnter: (n: number) => void
}) {
  const yellow = selecting || mark === 'draft'
  const bg = yellow
    ? 'bg-[rgba(245,197,24,0.14)] shadow-[inset_3px_0_0_#F5C518]'
    : mark === 'saved'
      ? 'bg-code-note/[0.13] shadow-[inset_3px_0_0_theme(colors.code.note)]'
      : active
        ? 'bg-[rgba(125,183,255,0.18)]'
        : hit
          ? 'bg-[rgba(125,183,255,0.08)]'
          : ''
  const gutter = yellow ? 'text-bug' : mark === 'saved' ? 'text-code-note-text' : 'text-code-dim'
  return (
    <div data-line={n} className={`flex ${bg}`} onMouseEnter={() => onEnter(n)}>
      <div
        className={`w-14 flex-none cursor-pointer select-none pr-4 text-right font-mono text-code hover:text-code-text ${gutter}`}
        onMouseDown={(e) => {
          e.preventDefault()
          onDown(n, e.shiftKey)
        }}
        title="Drag to select lines"
      >
        {n}
      </div>
      <pre className="m-0 flex-1 whitespace-pre pr-6 font-mono text-code text-code-text">
        {tokens.length === 0 ? ' ' : tokens.map((t, i) => (
          <span key={i} className={TOKEN_CLASS[t.kind]}>{t.text}</span>
        ))}
      </pre>
    </div>
  )
})

export const CodePane = forwardRef<CodePaneHandle, Props>(function CodePane(p, ref) {
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ anchor: number; head: number } | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag
  const lastClick = useRef<number | null>(null)

  useImperativeHandle(ref, () => ({
    scrollToLine(line: number) {
      const el = scroller.current?.querySelector(`[data-line="${line}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
  }))

  const onDown = useCallback((n: number, shift: boolean) => {
    const anchor = shift && lastClick.current != null ? lastClick.current : n
    setDrag({ anchor, head: n })
  }, [])
  const onEnter = useCallback((n: number) => {
    if (dragRef.current) setDrag({ ...dragRef.current, head: n })
  }, [])

  useEffect(() => {
    const up = () => {
      const d = dragRef.current
      if (!d) return
      lastClick.current = d.anchor
      setDrag(null)
      p.onSelect(Math.min(d.anchor, d.head), Math.max(d.anchor, d.head))
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [p.onSelect])

  // Report which line is at the top of the viewport (for the breadcrumb and outline).
  const ticking = useRef(false)
  const onScroll = () => {
    if (ticking.current) return
    ticking.current = true
    requestAnimationFrame(() => {
      ticking.current = false
      const box = scroller.current?.getBoundingClientRect()
      if (!box) return
      const el = document.elementFromPoint(box.left + 30, box.top + 40)?.closest('[data-line]')
      if (el) p.onTopLineChange(Number(el.getAttribute('data-line')))
    })
  }

  const lo = drag ? Math.min(drag.anchor, drag.head) : 0
  const hi = drag ? Math.max(drag.anchor, drag.head) : -1

  const rows: ReactNode[] = []
  let hiddenFrom: number | null = null
  const flushHidden = (upTo: number) => {
    if (hiddenFrom == null) return
    const from = hiddenFrom, count = upTo - from + 1
    rows.push(
      <button key={`gap-${from}`} type="button" onClick={p.onShowAll}
        className="my-1.5 block w-full bg-code-fold py-1 pl-[72px] pr-4 text-left font-mono text-xs text-code-dim hover:text-code-text">
        ⋯ Show {count} hidden line{count === 1 ? '' : 's'} ({from}–{upTo})
      </button>,
    )
    hiddenFrom = null
  }
  p.tokens.forEach((t, i) => {
    const n = i + 1
    if (p.focusLines && !p.focusLines.has(n)) {
      if (hiddenFrom == null) hiddenFrom = n
      return
    }
    flushHidden(n - 1)
    rows.push(
      <Fragment key={n}>
        <Row n={n} tokens={t} mark={p.marks.get(n)} hit={p.searchHits.has(n)} active={p.activeHit === n}
          selecting={n >= lo && n <= hi} onDown={onDown} onEnter={onEnter} />
        {p.inserts.get(n)}
      </Fragment>,
    )
  })
  flushHidden(p.tokens.length)

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-code-bg">
      <div className="flex h-10 flex-none items-center justify-between gap-4 bg-code-bg px-4 text-[12.5px] text-code-text">
        <div className="flex h-full min-w-0 items-center gap-2.5 font-mono">
          <span className="flex-none">{p.path}</span>
          {p.breadcrumb && (<><span className="text-code-dim">›</span><span className="truncate text-code-dim">{p.breadcrumb}()</span></>)}
        </div>
        <div className="flex flex-none items-center gap-4">
          {p.linking && <span className="whitespace-nowrap text-bug">Linking: pick lines in any file</span>}
          <button type="button" onClick={p.onToggleFocus} disabled={!p.canFocus && !p.focus}
            title="Show only the lines around your comments"
            className="rounded bg-code-hover px-2 py-0.5 text-code-dim hover:text-code-text disabled:opacity-40">
            {p.focus ? 'Show all code' : 'Collapse unrelated code'}
          </button>
          <span className="whitespace-nowrap text-code-dim">{p.tokens.length} lines · read-only</span>
        </div>
      </div>
      <div ref={scroller} onScroll={onScroll} className={`flex-1 overflow-auto pb-24 pt-2.5 ${drag ? 'select-none' : ''}`}>
        <div className="min-w-max">{rows}</div>
      </div>
    </main>
  )
})
