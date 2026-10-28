import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { editorTheme, languageOf, monaco, pathOf, uriOf } from '../lib/monaco'
import { currentTheme, onThemeChange } from '../lib/theme'

export type LineMark = { start: number; end: number; kind: 'draft' | 'saved' }
export interface Insert { key: string; afterLine: number; node: ReactNode }

export interface CodeEditorHandle {
  scrollToLine: (line: number) => void
  find: () => void
}

interface Props {
  files: { path: string; original: string; current: string }[]
  path: string                              // the open file
  marks: LineMark[]                         // in the open file, current line numbers
  inserts: Insert[]                         // rendered between lines (comment cards, the composer)
  focusLines: Set<number> | null            // null = show every line
  breadcrumb: string | undefined
  linking: boolean
  onChange: (path: string, text: string) => void
  onSelectLines: (start: number, end: number) => void
  onOpenFile: (path: string, line: number) => void
  onTopLineChange: (line: number) => void
  onShowAll: () => void
  focus: boolean
  canFocus: boolean
  onToggleFocus: () => void
}

const FONT = { fontFamily: '"Source Code Pro", ui-monospace, monospace', fontSize: 13, lineHeight: 20 }

/** A view zone's content: a portal target that reports its height so Monaco can make room for it. */
function ZoneBody({ onHeight, children }: { onHeight: (h: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => onHeight(Math.ceil(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeight])
  return <div ref={ref} className="flow-root">{children}</div>
}

/**
 * The code pane: Monaco with one model per exercise file, so edits, go-to-definition (⌘/Ctrl-click,
 * across files) and find all work like VS Code. Comment cards and the composer live in view zones.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(p, ref) {
  const host = useRef<HTMLDivElement>(null)
  const diffHost = useRef<HTMLDivElement>(null)
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const models = useRef(new Map<string, monaco.editor.ITextModel>())
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>())
  const shownPath = useRef<string | null>(null)
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const zones = useRef(new Map<string, {
    id: string; dom: HTMLDivElement; spacer: HTMLDivElement; widget: monaco.editor.IOverlayWidget; line: number; zone: monaco.editor.IViewZone
  }>())
  const [portals, setPortals] = useState<{ key: string; dom: HTMLDivElement }[]>([])
  // Bumped each time an editor is created, so effects re-apply to it (React's dev mode mounts twice).
  const [gen, setGen] = useState(0)
  const [showDiff, setShowDiff] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const cb = useRef(p)
  cb.current = p

  useImperativeHandle(ref, () => ({
    scrollToLine(line) {
      const e = ed.current
      if (!e) return
      e.revealLineInCenter(line, monaco.editor.ScrollType.Smooth)
      e.setPosition({ lineNumber: line, column: 1 })
    },
    find() {
      ed.current?.focus()
      ed.current?.getAction('actions.find')?.run()
    },
  }))

  // ---- create the editor and the models once
  useEffect(() => {
    const e = monaco.editor.create(host.current!, {
      theme: editorTheme(currentTheme()), ...FONT, automaticLayout: true, scrollBeyondLastLine: false, padding: { top: 10, bottom: 96 },
      minimap: { enabled: true, renderCharacters: false, scale: 1 }, lineNumbersMinChars: 4, glyphMargin: false,
      fixedOverflowWidgets: true, smoothScrolling: true, stickyScroll: { enabled: false }, tabSize: 2,
      renderLineHighlight: 'line', 'semanticHighlighting.enabled': false, contextmenu: true,
    })
    ed.current = e
    decorations.current = e.createDecorationsCollection()
    for (const f of cb.current.files) {
      const m = monaco.editor.createModel(f.current, languageOf(f.path), uriOf(f.path))
      m.onDidChangeContent(() => cb.current.onChange(f.path, m.getValue()))
      models.current.set(f.path, m)
    }
    e.setModel(models.current.get(cb.current.path) ?? null)
    shownPath.current = cb.current.path

    const commentOnSelection = () => {
      const s = e.getSelection()
      if (!s) return
      let end = s.endLineNumber
      if (s.endColumn === 1 && end > s.startLineNumber) end--
      cb.current.onSelectLines(s.startLineNumber, end)
    }
    // Dragging in the line numbers selects whole lines (Monaco does that); releasing opens the composer.
    let fromGutter = false
    e.onMouseDown((ev) => { fromGutter = ev.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS })
    e.onMouseUp(() => { if (fromGutter) { fromGutter = false; commentOnSelection() } })
    e.addAction({
      id: 'readcode.comment', label: 'Comment on selected lines', contextMenuGroupId: 'navigation', contextMenuOrder: 0,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM], run: commentOnSelection,
    })
    e.onDidScrollChange(() => {
      const r = e.getVisibleRanges()[0]
      if (r) cb.current.onTopLineChange(r.startLineNumber)
    })
    // ⌘/Ctrl-click or F12 on a name defined in another exercise file opens that file.
    const opener = monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selection) {
        const path = pathOf(resource)
        if (!models.current.has(path)) return false
        const line = !selection ? 1 : 'startLineNumber' in selection ? selection.startLineNumber : selection.lineNumber
        cb.current.onOpenFile(path, line)
        return true
      },
    })
    setGen((g) => g + 1)
    // Monaco's theme is global; follow the app's light/dark switch.
    const stopTheme = onThemeChange((t) => monaco.editor.setTheme(editorTheme(t)))
    return () => {
      stopTheme()
      opener.dispose()
      e.dispose()
      for (const m of models.current.values()) m.dispose()
      models.current.clear()
      ed.current = null
      decorations.current = null
      shownPath.current = null
      viewStates.current.clear()
      zones.current.clear()
    }
  }, [])

  // ---- switch the open file, keeping each file's scroll and cursor
  useLayoutEffect(() => {
    const e = ed.current
    if (!e || shownPath.current === p.path) return
    if (shownPath.current) viewStates.current.set(shownPath.current, e.saveViewState())
    e.setModel(models.current.get(p.path) ?? null)
    const vs = viewStates.current.get(p.path)
    if (vs) e.restoreViewState(vs)
    shownPath.current = p.path
    // View zones belong to the view and are dropped on a model change; drop their overlays with them.
    for (const z of zones.current.values()) e.removeOverlayWidget(z.widget)
    zones.current.clear()
    setShowDiff(false)
    setConfirmReset(false)
  }, [p.path, gen])

  // ---- outside changes to a file's text (Reset file) flow into its model
  useEffect(() => {
    for (const f of p.files) {
      const m = models.current.get(f.path)
      if (m && m.getValue() !== f.current) m.setValue(f.current)
    }
  }, [p.files])

  // ---- line highlights
  useEffect(() => {
    decorations.current?.set(p.marks.map((m) => ({
      range: new monaco.Range(m.start, 1, m.end, 1),
      options: { isWholeLine: true, className: `rc-line-${m.kind}`, linesDecorationsClassName: `rc-gutter-${m.kind}` },
    })))
  }, [p.marks, p.path, gen])

  // ---- collapse unrelated code (Monaco's hidden areas; not in the public typings)
  useEffect(() => {
    const e = ed.current as (monaco.editor.IStandaloneCodeEditor & { setHiddenAreas?: (r: monaco.IRange[]) => void }) | null
    const model = e?.getModel()
    if (!e?.setHiddenAreas || !model) return
    const hidden: monaco.IRange[] = []
    if (p.focusLines) {
      let from = 0
      for (let n = 1; n <= model.getLineCount() + 1; n++) {
        const hide = n <= model.getLineCount() && !p.focusLines.has(n)
        if (hide && !from) from = n
        if (!hide && from) { hidden.push(new monaco.Range(from, 1, n - 1, 1)); from = 0 }
      }
    }
    e.setHiddenAreas(hidden)
  }, [p.focusLines, p.path, gen])

  // ---- comment cards and the composer between lines
  // A view zone reserves the space between lines; the content itself lives in an overlay widget kept on
  // top of that space (view zones sit under Monaco's text layer, so their own content can't be clicked).
  const signature = p.inserts.map((i) => `${i.key}@${i.afterLine}`).join('|')
  useLayoutEffect(() => {
    const e = ed.current
    if (!e) return
    e.changeViewZones((acc) => {
      const want = new Map(p.inserts.map((i) => [i.key, i]))
      for (const [key, z] of zones.current) {
        if (want.get(key)?.afterLine !== z.line) {
          acc.removeZone(z.id)
          e.removeOverlayWidget(z.widget)
          zones.current.delete(key)
        }
      }
      for (const i of p.inserts) {
        if (zones.current.has(i.key)) continue
        const dom = document.createElement('div') // the overlay: what you see and click
        dom.style.position = 'absolute'
        dom.style.display = 'none'
        // Keep typing and clicks inside a comment box away from the editor underneath.
        for (const type of ['keydown', 'keypress', 'keyup', 'mousedown', 'pointerdown', 'copy', 'paste', 'cut'])
          dom.addEventListener(type, (ev) => ev.stopPropagation())
        const spacer = document.createElement('div') // the zone: empty space between lines
        const zone: monaco.editor.IViewZone = {
          afterLineNumber: i.afterLine, heightInPx: 56, domNode: spacer, suppressMouseDown: true,
          onDomNodeTop: (top) => { dom.style.top = `${top}px`; dom.style.display = 'block' },
        }
        const widget: monaco.editor.IOverlayWidget = { getId: () => `readcode.zone.${i.key}`, getDomNode: () => dom, getPosition: () => null }
        e.addOverlayWidget(widget)
        zones.current.set(i.key, { id: acc.addZone(zone), dom, spacer, widget, line: i.afterLine, zone })
      }
    })
    placeOverlays()
    setPortals([...zones.current].map(([key, z]) => ({ key, dom: z.dom })))
  }, [signature, p.path, gen])

  /** Line the overlays up with the code column, and hide those whose zone scrolled out of view. */
  const placeOverlays = () => {
    const e = ed.current
    if (!e) return
    const info = e.getLayoutInfo()
    for (const z of zones.current.values()) {
      z.dom.style.left = `${info.contentLeft}px`
      z.dom.style.width = `${info.contentWidth - info.verticalScrollbarWidth}px`
      if (z.spacer.style.display === 'none' || !z.spacer.isConnected) z.dom.style.display = 'none'
    }
  }
  useEffect(() => {
    const e = ed.current
    if (!e) return
    // Monaco renders on the next frame after these events; check visibility once it has.
    const later = () => requestAnimationFrame(placeOverlays)
    const subs = [e.onDidScrollChange(later), e.onDidLayoutChange(later), e.onDidChangeHiddenAreas(later)]
    return () => subs.forEach((d) => d.dispose())
  }, [gen])

  const setZoneHeight = useRef((key: string, h: number) => {
    const z = zones.current.get(key)
    if (!z || z.zone.heightInPx === h) return
    z.zone.heightInPx = h
    ed.current?.changeViewZones((acc) => acc.layoutZone(z.id))
  }).current
  const heightFns = useRef(new Map<string, (h: number) => void>())
  const heightFor = (key: string) => {
    let fn = heightFns.current.get(key)
    if (!fn) { fn = (h: number) => setZoneHeight(key, h); heightFns.current.set(key, fn) }
    return fn
  }
  const byKey = new Map(p.inserts.map((i) => [i.key, i.node]))

  // ---- "Show my changes": an inline diff of this file against the shipped version
  const file = p.files.find((f) => f.path === p.path)
  const edited = !!file && file.current !== file.original
  useEffect(() => {
    if (!showDiff || !diffHost.current || !file) return
    const original = monaco.editor.createModel(file.original, languageOf(file.path))
    const diff = monaco.editor.createDiffEditor(diffHost.current, {
      theme: editorTheme(currentTheme()), ...FONT, automaticLayout: true, renderSideBySide: false, originalEditable: false,
      scrollBeyondLastLine: false, minimap: { enabled: false }, renderOverviewRuler: false,
    })
    diff.setModel({ original, modified: models.current.get(file.path)! })
    // Open on the first change rather than the top of the file.
    let shown = false
    const sub = diff.onDidUpdateDiff(() => {
      const first = diff.getLineChanges()?.[0]
      if (shown || !first) return
      shown = true
      diff.getModifiedEditor().revealLineInCenter(Math.max(1, first.modifiedStartLineNumber))
    })
    return () => { sub.dispose(); diff.dispose(); original.dispose() }
  }, [showDiff, p.path])
  useEffect(() => { if (!edited) setShowDiff(false) }, [edited])

  const lineCount = file ? file.current.split('\n').length : 0
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-code-bg">
      <div className="flex h-10 flex-none items-center justify-between gap-4 bg-code-bg px-4 text-[12.5px] text-code-text">
        <div className="flex min-w-0 items-center gap-2.5 font-mono">
          <span className="flex-none">{p.path}</span>
          {edited && <span className="flex-none font-sans text-[11.5px] text-sec-bugs" title="You have edited this file">● edited</span>}
          {p.breadcrumb && !showDiff && (<><span className="text-code-dim">›</span><span className="truncate text-code-dim">{p.breadcrumb}()</span></>)}
        </div>
        <div className="flex flex-none items-center gap-2 font-sans">
          {p.linking && <span className="mr-2 whitespace-nowrap text-bug">Linking: pick lines in any file</span>}
          {edited && (
            <>
              <button type="button" onClick={() => setShowDiff((d) => !d)}
                className="rounded bg-code-hover px-2 py-0.5 text-code-dim hover:text-code-text">
                {showDiff ? 'Back to editing' : 'Show my changes'}
              </button>
              <button type="button" onBlur={() => setConfirmReset(false)}
                onClick={() => { if (!confirmReset) return setConfirmReset(true); setConfirmReset(false); file && p.onChange(file.path, file.original) }}
                className={`rounded px-2 py-0.5 ${confirmReset ? 'bg-danger/20 text-danger' : 'bg-code-hover text-code-dim hover:text-code-text'}`}>
                {confirmReset ? 'Click again to discard edits' : 'Reset file'}
              </button>
            </>
          )}
          {!showDiff && (
            <button type="button" onClick={p.onToggleFocus} disabled={!p.canFocus && !p.focus}
              title="Show only the lines around your comments"
              className="rounded bg-code-hover px-2 py-0.5 text-code-dim hover:text-code-text disabled:opacity-40">
              {p.focus ? 'Show all code' : 'Collapse unrelated code'}
            </button>
          )}
          <span className="ml-2 whitespace-nowrap text-code-dim">{lineCount} lines</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={host} className={`absolute inset-0 ${showDiff ? 'invisible' : ''}`} />
        {showDiff && <div ref={diffHost} className="absolute inset-0" />}
      </div>
      {portals.map((z) => byKey.has(z.key) && createPortal(<ZoneBody onHeight={heightFor(z.key)}>{byKey.get(z.key)}</ZoneBody>, z.dom, z.key))}
    </main>
  )
})
