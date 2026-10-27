// Editable code pane (CodeMirror 6). One EditorView; each file keeps its own EditorState,
// so switching tabs keeps undo history and cursor position.
import { useEffect, useRef } from 'react'
import { python } from '@codemirror/lang-python'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { basicSetup } from 'codemirror'

const look = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '13px', backgroundColor: '#0E1621' },
    '.cm-scroller': { fontFamily: '"IBM Plex Mono", ui-monospace, monospace', lineHeight: '20px' },
    '.cm-gutters': { backgroundColor: '#0E1621', borderRight: '1px solid #26354A', color: '#8497AD' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#16212E' },
  },
  { dark: true },
)

export function CodeEditor({ path, doc, readOnly, onChange }: {
  path: string
  doc: string
  readOnly: boolean
  onChange: (path: string, text: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const shownPath = useRef<string | null>(null)
  const states = useRef(new Map<string, EditorState>())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    view.current = new EditorView({ parent: host.current! })
    return () => {
      view.current?.destroy()
      view.current = null
      shownPath.current = null
    }
  }, [])

  useEffect(() => {
    const v = view.current
    if (!v) return
    if (shownPath.current === path && v.state.doc.toString() === doc && v.state.readOnly === readOnly) return
    if (shownPath.current) states.current.set(shownPath.current, v.state)
    let state = states.current.get(path)
    if (!state || state.doc.toString() !== doc || state.readOnly !== readOnly) {
      const ext: Extension[] = [
        basicSetup,
        keymap.of([indentWithTab]),
        oneDark,
        look,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(path, u.state.doc.toString())
        }),
      ]
      if (path.endsWith('.py')) ext.push(python())
      state = EditorState.create({ doc, extensions: ext })
    }
    v.setState(state)
    shownPath.current = path
  }, [path, doc, readOnly])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
