import { useState } from 'react'
import type { ReactNode } from 'react'
import type { OutlineSection } from '../lib/outline'

export interface FileEntry {
  path: string
  lines: number
  comments: number
  edited: boolean
}

interface Props {
  rootName: string
  files: FileEntry[]
  activeFile: string
  onOpenFile: (path: string) => void
  sections: OutlineSection[]
  currentFn: string | undefined
  savedCount: Map<string, number>
  draftFn: string | undefined
  onJump: (line: number) => void
}

// Editor-style file-type badges, keyed by extension.
const FILE_BADGE: Record<string, [string, string]> = {
  ts: ['TS', '#4A9FE8'], tsx: ['TS', '#4A9FE8'], js: ['JS', '#E8D44D'], jsx: ['JS', '#E8D44D'],
  c: ['C', '#7FA7D9'], h: ['h', '#B48EE0'], py: ['py', '#E8C547'], go: ['go', '#5DC9E2'],
}

function FileIcon({ path }: { path: string }) {
  const badge = FILE_BADGE[path.split('.').pop() ?? '']
  if (!badge) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="flex-none text-code-dim">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      </svg>
    )
  }
  return (
    <span aria-hidden="true" style={{ color: badge[1] }}
      className="w-4 flex-none text-center font-sans text-[10px] font-bold leading-none tracking-tight">{badge[0]}</span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
      className={`flex-none transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z" />
    </svg>
  )
}

/** Outline symbol icons, coloured like an editor's: classes orange, methods purple, other declarations blue. */
function SymbolIcon({ kind }: { kind: 'class' | 'method' | 'other' }) {
  const color = kind === 'class' ? '#E8A657' : kind === 'method' ? '#B48EE0' : '#7DB7FF'
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3" aria-hidden="true" className="flex-none">
      {kind === 'method' ? (
        <><path d="M8 1.8l5.2 3v6.4L8 14.2l-5.2-3V4.8z" /><path d="M2.8 4.8L8 7.8l5.2-3M8 7.8v6.4" /></>
      ) : kind === 'class' ? (
        <><rect x="2" y="5" width="7" height="7" rx="1" /><path d="M6 5V3h8v7h-5" /></>
      ) : (
        <><path d="M3 4h10M3 8h10M3 12h6" /></>
      )}
    </svg>
  )
}

function Count({ n, drafting = false }: { n: number; drafting?: boolean }) {
  return (
    <b className={`min-w-4 rounded-lg px-[5px] py-px text-center font-sans text-[11px] font-semibold leading-4 ${drafting ? 'bg-bug text-bug-ink' : 'bg-code-note text-white'}`}>
      {n}
    </b>
  )
}

function Section({ title, open, onToggle, children }: { title: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-none flex-col">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex h-[22px] w-full items-center gap-1 px-1 text-left text-[11px] font-bold tracking-[0.04em] text-code-text hover:bg-code-hover">
        <Chevron open={open} />
        <span className="min-w-0 truncate">{title}</span>
      </button>
      {open && children}
    </div>
  )
}

interface TreeNode {
  name: string
  path: string
  file?: FileEntry
  children: TreeNode[]
}

/** Folders first (alphabetical), then files in the exercise's own order, which puts the starting file first. */
function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    parts.slice(0, -1).forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let dir = node.children.find((c) => !c.file && c.name === part)
      if (!dir) { dir = { name: part, path, children: [] }; node.children.push(dir) }
      node = dir
    })
    node.children.push({ name: parts[parts.length - 1], path: f.path, file: f, children: [] })
  }
  const order = (n: TreeNode): TreeNode => ({
    ...n,
    children: [...n.children.filter((c) => !c.file).sort((a, b) => a.name.localeCompare(b.name)).map(order),
      ...n.children.filter((c) => c.file)],
  })
  return order(root).children
}

const indent = (depth: number) => ({ paddingLeft: `${8 + depth * 12}px` })

function FileTree({ nodes, depth, activeFile, onOpenFile, closed, onToggle }: {
  nodes: TreeNode[]
  depth: number
  activeFile: string
  onOpenFile: (path: string) => void
  closed: Set<string>
  onToggle: (dir: string) => void
}) {
  return (
    <>
      {nodes.map((n) => {
        if (!n.file) {
          const open = !closed.has(n.path)
          return (
            <div key={n.path} className="flex flex-col">
              <button type="button" onClick={() => onToggle(n.path)} aria-expanded={open} style={indent(depth)}
                className={`${ROW} ${rowState(false)}`}>
                <Chevron open={open} />
                <span className="truncate">{n.name}</span>
              </button>
              {open && <FileTree nodes={n.children} depth={depth + 1} activeFile={activeFile} onOpenFile={onOpenFile} closed={closed} onToggle={onToggle} />}
            </div>
          )
        }
        const f = n.file
        const active = f.path === activeFile
        return (
          <button key={f.path} role="tab" type="button" aria-selected={active} onClick={() => onOpenFile(f.path)}
            title={`${f.path} · ${f.lines} lines`} style={indent(depth + 1)} className={`${ROW} ${rowState(active)}`}>
            <FileIcon path={f.path} />
            <span className={`min-w-0 flex-1 truncate ${f.edited ? 'text-sec-bugs' : ''}`}>{n.name}</span>
            {f.comments > 0 && <Count n={f.comments} />}
            {f.edited && <span title="Edited" aria-label="edited" className="h-1.5 w-1.5 flex-none rounded-full bg-sec-bugs" />}
          </button>
        )
      })}
    </>
  )
}

const ROW = 'flex h-[22px] w-full items-center gap-1.5 pr-2 text-left text-[13px] leading-none'
const rowState = (active: boolean) =>
  active ? 'bg-code-select text-ink shadow-[inset_1px_0_0_theme(colors.code.note)]' : 'text-code-text hover:bg-code-hover'

export function Sidebar(p: Props) {
  const [filesOpen, setFilesOpen] = useState(true)
  const [rootOpen, setRootOpen] = useState(true)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [closed, setClosed] = useState<Set<number>>(new Set())
  const [closedDirs, setClosedDirs] = useState<Set<string>>(new Set())
  const toggleDir = (dir: string) =>
    setClosedDirs((c) => { const n = new Set(c); n.has(dir) ? n.delete(dir) : n.add(dir); return n })
  const toggleSection = (line: number) =>
    setClosed((c) => { const n = new Set(c); n.has(line) ? n.delete(line) : n.add(line); return n })

  return (
    <aside className="flex w-60 flex-none flex-col overflow-y-auto bg-canvas font-sans text-code-text">
      <div className="flex h-[35px] flex-none items-center px-4 text-[11px] font-medium tracking-[0.06em] text-code-dim">EXPLORER</div>

      <Section title="FILES" open={filesOpen} onToggle={() => setFilesOpen((o) => !o)}>
        <button type="button" onClick={() => setRootOpen((o) => !o)} aria-expanded={rootOpen}
          className={`${ROW} pl-2 font-semibold ${rowState(false)}`}>
          <Chevron open={rootOpen} />
          <span className="truncate">{p.rootName}</span>
        </button>
        {rootOpen && (
          <div role="tablist" aria-label="Files" aria-orientation="vertical" className="flex flex-col">
            <FileTree nodes={buildTree(p.files)} depth={1} activeFile={p.activeFile} onOpenFile={p.onOpenFile}
              closed={closedDirs} onToggle={toggleDir} />
          </div>
        )}
      </Section>

      <div className="h-3 flex-none" />
      <Section open={outlineOpen} onToggle={() => setOutlineOpen((o) => !o)}
        title={<>OUTLINE <span className="font-normal tracking-normal text-code-dim">· {p.activeFile}</span></>}>
        {p.sections.map((s) => {
          const isClass = s.title.startsWith('class ')
          const open = !closed.has(s.line)
          return (
            <div key={s.line} className="flex flex-none flex-col">
              <div className={`${ROW} pl-2 ${rowState(false)}`}>
                {s.functions.length > 0 ? (
                  <button type="button" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onClick={() => toggleSection(s.line)}>
                    <Chevron open={open} />
                  </button>
                ) : <span className="w-3 flex-none" />}
                <button type="button" onClick={() => p.onJump(s.line)} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <SymbolIcon kind={isClass ? 'class' : 'other'} />
                  <span className="truncate">{s.title.replace(/^(class|interface|type|const|enum) /, '')}</span>
                  {!isClass && s.title !== 'Functions' && s.title !== 'Top of file' && (
                    <span className="flex-none text-[11.5px] text-code-dim">{s.title.split(' ')[0]}</span>
                  )}
                </button>
              </div>
              {open && s.functions.map((f) => {
                const active = f.name === p.currentFn
                const saved = p.savedCount.get(f.name) ?? 0
                const drafting = p.draftFn === f.name
                return (
                  <button key={`${f.name}:${f.line}`} type="button" onClick={() => p.onJump(f.line)}
                    className={`${ROW} pl-[34px] ${rowState(active)}`}>
                    <SymbolIcon kind="method" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    {(saved > 0 || drafting) && <Count n={saved + (drafting ? 1 : 0)} drafting={drafting} />}
                    <span className="flex-none text-[11.5px] text-code-dim">{f.line}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </Section>

      <div className="flex-1" />
      <p className="m-3 mt-6 flex-none text-[11.5px] leading-[1.45] text-code-dim">
        <b className="font-semibold text-code-text">Tip:</b> drag across line numbers (or right-click a selection) to
        comment. ⌘/Ctrl-click a name to jump to its definition. You can edit the code; edits are kept as notes, not graded.
      </p>
    </aside>
  )
}
