import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Logo } from '../components/Logo'
import { CHALLENGE, testBundle } from '../playground/challenge'
import type { TestResult } from '../playground/challenge'
import { ORIGINAL, bundle } from '../playground/project'
import type { Files, LogLine } from '../playground/project'

const STORE_KEY = 'readcode:playground:files'
const AUTO_RUN_DELAY = 600
const CHALLENGE_TAB = '#challenge'   // not a valid file name, so it can't collide with one
const CHECK_TIMEOUT = 5000

// A saved edit remembers the original it started from. If that original has since changed
// (the app was updated), the edit is dropped so it can't silently mask the new code.
interface Saved { base: string; text: string }

function loadFiles(): Files {
  const files = { ...ORIGINAL }
  try {
    const saved: Record<string, Saved> = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    for (const [k, s] of Object.entries(saved)) if (k in ORIGINAL && s?.base === ORIGINAL[k]) files[k] = s.text
  } catch {
    /* blocked or corrupt storage: start from the original */
  }
  return files
}

function saveFiles(files: Files, base: Files) {
  try {
    const changed = Object.fromEntries(Object.entries(files)
      .filter(([k, v]) => v !== base[k])
      .map(([k, v]) => [k, { base: base[k], text: v } satisfies Saved]))
    if (Object.keys(changed).length) localStorage.setItem(STORE_KEY, JSON.stringify(changed))
    else localStorage.removeItem(STORE_KEY)
  } catch {
    /* edits just won't survive a refresh */
  }
}

export default function PlaygroundPage() {
  // The originals as of page load; ORIGINAL itself can change under a hot reload.
  const [base, setBase] = useState<Files>(() => ({ ...ORIGINAL }))
  const [files, setFiles] = useState<Files>(loadFiles)
  const [active, setActive] = useState(CHALLENGE_TAB)
  const [doc, setDoc] = useState(() => bundle(files))
  const [runId, setRunId] = useState(0)
  const [autoRun, setAutoRun] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => { saveFiles(files, base) }, [files, base])

  const run = useCallback(() => {
    setLogs([])
    setDoc(bundle(files))
    setRunId((n) => n + 1)   // remount the iframe so timers and state from the last run are gone
  }, [files])

  useEffect(() => {
    if (!autoRun) return
    const t = setTimeout(run, AUTO_RUN_DELAY)
    return () => clearTimeout(t)
  }, [files, autoRun])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__playground) return
      setLogs((l) => [...l.slice(-199), { level: e.data.level, text: e.data.text }])
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  // ---- challenge: run the tests against the current code in a hidden iframe
  const [check, setCheck] = useState<{ doc: string; id: number } | null>(null)
  const [results, setResults] = useState<TestResult[] | 'timeout' | null>(null)
  const checkFrame = useRef<HTMLIFrameElement>(null)
  const runCheck = () => {
    setResults(null)
    setCheck((c) => ({ doc: testBundle(files), id: (c?.id ?? 0) + 1 }))
  }
  useEffect(() => {
    if (!check) return
    const onMessage = (e: MessageEvent) => {
      if (e.source !== checkFrame.current?.contentWindow || !e.data?.__challenge) return
      setResults(e.data.results)
      setCheck(null)
    }
    // A crash in the user's code means the tests never report back.
    const t = setTimeout(() => { setResults('timeout'); setCheck(null) }, CHECK_TIMEOUT)
    window.addEventListener('message', onMessage)
    return () => { clearTimeout(t); window.removeEventListener('message', onMessage) }
  }, [check])
  const solved = Array.isArray(results) && results.every((r) => r.pass)
  // Reproduce: restart the app on the current code, then type the failing search once it has loaded.
  const pendingSearch = useRef<string | null>(null)
  const reproduce = () => { pendingSearch.current = CHALLENGE.reproduceQuery; run() }
  const onPreviewLoad = () => {
    if (pendingSearch.current == null) return
    frame.current?.contentWindow?.postMessage({ __playgroundSearch: pendingSearch.current }, '*')
    pendingSearch.current = null
  }

  const modified = (name: string) => files[name] !== base[name]
  const anyModified = Object.keys(files).some(modified)
  const reset = () => {
    if (!confirm('Discard all your changes and restore the original code?')) return
    setBase({ ...ORIGINAL })
    setFiles({ ...ORIGINAL })
    setLogs([])
    setDoc(bundle(ORIGINAL))
    setRunId((n) => n + 1)
  }
  const errors = logs.filter((l) => l.level === 'error').length

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex h-14 flex-none items-center gap-4 border-b border-line bg-white px-5">
        <Logo />
        <span className="text-muted">Playground · food-delivery app</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
            Auto-run
          </label>
          <button type="button" onClick={reset} disabled={!anyModified}
            className="h-9 rounded-lg border border-line-strong bg-white px-3.5 font-medium hover:border-ink disabled:opacity-40">
            Reset code
          </button>
          <button type="button" onClick={run} title="Ctrl/⌘ + Enter"
            className="h-9 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-[#1A43B8]">
            ▶ Run
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: the codebase, editable and runnable */}
        <section className="relative flex w-[46%] min-w-[420px] flex-col bg-code-bg">
          <div className="flex h-10 flex-none items-stretch overflow-x-auto border-b border-code-border bg-code-bar text-[12.5px]">
            <button type="button" onClick={() => setActive(CHALLENGE_TAB)}
              className={`flex items-center gap-1.5 border-r border-code-border px-3.5 font-semibold ${active === CHALLENGE_TAB ? 'bg-code-bg text-code-text' : 'text-code-dim hover:text-code-text'}`}>
              {solved ? <span className="text-[#5BD08A]">✓</span> : <span className="text-bug">⚑</span>}
              Challenge
            </button>
            {Object.keys(files).map((name) => (
              <button key={name} type="button" onClick={() => setActive(name)}
                className={`flex items-center gap-1.5 border-r border-code-border px-3.5 font-mono ${name === active ? 'bg-code-bg text-code-text' : 'text-code-dim hover:text-code-text'}`}>
                {name}
                {modified(name) && <span className="h-1.5 w-1.5 rounded-full bg-bug" title="Modified" />}
              </button>
            ))}
          </div>
          {active === CHALLENGE_TAB
            ? <ChallengePanel results={results} checking={!!check} solved={solved} onCheck={runCheck}
                onReproduce={reproduce} />
            : <Editor key={active} value={files[active]} onChange={(v) => setFiles((f) => ({ ...f, [active]: v }))} />}
          <Console logs={logs} errors={errors} onClear={() => setLogs([])} />
          {check && (
            <iframe key={check.id} ref={checkFrame} title="Challenge check" srcDoc={check.doc} aria-hidden="true"
              sandbox="allow-scripts allow-modals" className="pointer-events-none absolute h-px w-px opacity-0" />
          )}
        </section>

        {/* Right: the running app */}
        <section className="flex min-w-0 flex-1 flex-col border-l border-line bg-panel p-3">
          <div className="flex h-8 flex-none items-center gap-2 rounded-t-lg border border-b-0 border-line bg-white px-3 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-2 flex-1 truncate rounded bg-chip px-2 py-0.5 font-mono">quickeats.local</span>
            <span>Run #{runId + 1}</span>
          </div>
          <iframe key={runId} ref={frame} title="App preview" srcDoc={doc} onLoad={onPreviewLoad}
            sandbox="allow-scripts allow-modals allow-forms"
            className="min-h-0 w-full flex-1 rounded-b-lg border border-line bg-white" />
        </section>
      </div>
    </div>
  )
}

const INDENT = '  '

function insertText(ta: HTMLTextAreaElement, text: string) {
  // execCommand keeps the browser's undo history; setRangeText is the fallback where it's unsupported.
  if (!document.execCommand('insertText', false, text)) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

function onEditorKey(e: KeyboardEvent<HTMLTextAreaElement>) {
  const ta = e.currentTarget
  const { value, selectionStart: s } = ta
  if (e.key === 'Tab') {
    e.preventDefault()
    insertText(ta, INDENT)
  } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    const line = value.slice(value.lastIndexOf('\n', s - 1) + 1, s)
    insertText(ta, '\n' + line.match(/^[ \t]*/)![0] + (/[{([]\s*$/.test(line) ? INDENT : ''))
  }
}

function Editor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const gutter = useRef<HTMLDivElement>(null)
  const lines = value.split('\n').length
  return (
    <div className="flex min-h-0 flex-1">
      <div ref={gutter} aria-hidden="true"
        className="w-12 flex-none select-none overflow-hidden pr-3 pt-2.5 text-right font-mono text-code text-code-dim">
        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        <div className="h-24" />
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onEditorKey}
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop }}
        spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" wrap="off" aria-label="Code editor"
        className="min-w-0 flex-1 resize-none border-0 bg-transparent pb-24 pr-6 pt-2.5 font-mono text-code text-code-text caret-white outline-none selection:bg-[rgba(125,183,255,0.3)]" />
    </div>
  )
}

function ChallengePanel({ results, checking, solved, onCheck, onReproduce }: {
  results: TestResult[] | 'timeout' | null
  checking: boolean
  solved: boolean
  onCheck: () => void
  onReproduce: () => void
}) {
  const [hintsShown, setHintsShown] = useState(0)
  const heading = 'mb-2 text-[11px] font-semibold uppercase tracking-wider text-code-dim'
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-5 text-[13.5px] leading-[1.55] text-code-text">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-bug">Challenge · Bug fix</div>
      <h2 className="text-lg font-semibold">{CHALLENGE.title}</h2>

      <blockquote className="mt-3 rounded-lg border-l-[3px] border-code-note bg-code-note-bg px-3.5 py-2.5 italic text-code-note-text">
        {CHALLENGE.report}
      </blockquote>

      <h3 className={`${heading} mt-5`}>Your task</h3>
      <p>{CHALLENGE.task}</p>
      <p className="mt-2 text-code-dim">{CHALLENGE.rules}</p>

      <h3 className={`${heading} mt-5`}>Reproduce it</h3>
      <ol className="list-decimal space-y-1 pl-5">
        {CHALLENGE.reproduce.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <button type="button" onClick={onReproduce}
        className="mt-3 rounded-lg border border-code-border px-3 py-1.5 font-medium text-code-text hover:border-code-dim">
        Reproduce it for me: type “{CHALLENGE.reproduceQuery}” in the app →
      </button>

      <h3 className={`${heading} mt-5`}>How to solve it</h3>
      <p>Open the code files in the tabs above, find the cause, and edit it there. Click <b>▶ Run</b> to try your fix in the app, then <b>Check my fix</b> to run the tests.</p>

      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={onCheck} disabled={checking}
          className="h-9 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-[#1A43B8] disabled:opacity-60">
          {checking ? 'Checking…' : 'Check my fix'}
        </button>
        {Array.isArray(results) && (
          <span className={solved ? 'font-semibold text-[#5BD08A]' : 'text-[#FF8A80]'}>
            {solved ? 'Solved! All tests pass. 🎉' : `${results.filter((r) => r.pass).length} of ${results.length} tests pass`}
          </span>
        )}
      </div>

      {results === 'timeout' && (
        <p className="mt-3 rounded-lg bg-[rgba(255,138,128,0.12)] px-3 py-2 text-[#FF8A80]">
          The tests didn't finish. The app probably crashed on startup: click ▶ Run and check the console for errors.
        </p>
      )}
      {Array.isArray(results) && (
        <ul className="mt-3 space-y-1.5">
          {results.map((r) => (
            <li key={r.name} className="flex gap-2">
              <span className={r.pass ? 'text-[#5BD08A]' : 'text-[#FF8A80]'}>{r.pass ? '✓' : '✗'}</span>
              <span>
                {r.name}
                {!r.pass && <span className="block text-xs text-code-dim">{r.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className={`${heading} mt-6`}>Hints</h3>
      <ol className="list-decimal space-y-1.5 pl-5">
        {CHALLENGE.hints.slice(0, hintsShown).map((h) => <li key={h}>{h}</li>)}
      </ol>
      {hintsShown < CHALLENGE.hints.length && (
        <button type="button" onClick={() => setHintsShown((n) => n + 1)} className="mt-1 text-code-kw hover:underline">
          {hintsShown ? 'Show another hint' : 'Stuck? Show a hint'} ({hintsShown}/{CHALLENGE.hints.length})
        </button>
      )}
    </div>
  )
}

const LEVEL_CLASS: Record<LogLine['level'], string> = {
  log: 'text-code-text',
  info: 'text-code-kw',
  warn: 'text-code-const',
  error: 'text-[#FF8A80]',
}

function Console({ logs, errors, onClear }: { logs: LogLine[]; errors: number; onClear: () => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [logs])
  return (
    <div className="flex h-[30%] min-h-[120px] flex-none flex-col border-t border-code-border">
      <div className="flex h-8 flex-none items-center justify-between bg-code-bar px-3.5 text-xs text-code-dim">
        <span>Console{errors ? <span className="ml-2 text-[#FF8A80]">{errors} error{errors === 1 ? '' : 's'}</span> : null}</span>
        <button type="button" onClick={onClear} className="hover:text-code-text">Clear</button>
      </div>
      <div className="flex-1 overflow-auto px-3.5 py-2 font-mono text-xs leading-5">
        {logs.length === 0 && <div className="text-code-dim">Output from console.log and errors appear here.</div>}
        {logs.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap border-b border-code-border/40 py-0.5 ${LEVEL_CLASS[l.level]}`}>{l.text}</div>
        ))}
        <div ref={end} />
      </div>
    </div>
  )
}
