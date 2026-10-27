// Fix-and-quiz exercises (public.json "format": "fix_quiz", schemas/fixquiz-public.schema.json):
// types, the editor's file tree, saved progress, the exam API (served by the dev server, see
// scripts/exam-api.mjs), and the report download.

export interface Ticket {
  id: string
  title: string
  text: string
}

export interface QuizQuestion {
  id: string
  text: string
  options: { id: string; text: string }[]
}

export interface FixQuizExercise {
  format: 'fix_quiz'
  id: string
  version: number
  title: string
  language: string
  difficulty: string
  topics: string[]
  estimated_minutes: number
  files: { path: string; line_count: number }[]
  license: { spdx: string; attribution: string }
  fix: {
    minutes: number
    intro: string
    tickets: Ticket[]
    visible_tests: { nodeid: string; ticket: string }[]
    hidden_test_count: number
  }
  quiz: { minutes: number; intro: string; questions: QuizQuestion[] }
}

export type Phase = 'intro' | 'fix' | 'quiz' | 'done'

export interface TestResult {
  nodeid: string
  ticket: string
  passed: boolean
  message: string
}

export interface RunResult {
  tests: TestResult[]
  passed: number
  total: number
  at: number
}

export interface Score {
  total: number
  max: number
  fix: number
  fix_max: number
  quiz: number
  quiz_max: number
  tests_passed: number
  tests_total: number
  quiz_correct: number
  quiz_total: number
}

export interface ExamResult {
  score: Score
  reportPath: string
  filename: string
  html: string
}

export interface ExamState {
  phase: Phase
  candidate: string
  /** Files the candidate changed in the editor: path -> current text. Unchanged files are left out. */
  edits: Record<string, string>
  /** The edits frozen by Next; this is what gets graded. */
  submitted?: Record<string, string>
  openFiles: string[]
  activeFile?: string
  fixStartedAt?: number
  quizStartedAt?: number
  completedAt?: number
  answers: Record<string, string>
  /** Option ids per question, in the order this attempt shows them. */
  order: Record<string, string[]>
  lastRun?: RunResult
  result?: ExamResult
}

/** Deterministic shuffle (mulberry32 + Fisher-Yates), so an attempt keeps its option order across reloads. */
export function shuffled<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function emptyExam(ex: FixQuizExercise, seed = Date.now()): ExamState {
  const order = Object.fromEntries(ex.quiz.questions.map((q, i) => [q.id, shuffled(q.options.map((o) => o.id), seed + i)]))
  return { phase: 'intro', candidate: '', edits: {}, openFiles: [], answers: {}, order }
}

const CONFIG_NAMES = new Set(['conftest.py', 'pytest.ini', 'setup.cfg', 'tox.ini', 'pyproject.toml'])

/** Tests and pytest config can be read but not changed: grading always uses the originals. */
export function isLocked(path: string): boolean {
  return path.startsWith('tests/') || CONFIG_NAMES.has(path.split('/').pop() ?? '')
}

export interface TreeNode {
  name: string
  path: string
  children?: TreeNode[]
}

/** Nested folders/files from flat paths; folders first, then alphabetical. */
export function fileTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] }
  for (const p of paths) {
    const parts = p.split('/')
    let node = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      if (i === parts.length - 1) {
        node.children!.push({ name: part, path })
        return
      }
      let next = node.children!.find((c) => c.children && c.name === part)
      if (!next) {
        next = { name: part, path, children: [] }
        node.children!.push(next)
      }
      node = next
    })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n))
  return sort(root.children!)
}

const key = (id: string, version: number) => `readcode:fixquiz:${id}:v${version}`

export function loadExam(id: string, version: number): ExamState | null {
  try {
    const raw = localStorage.getItem(key(id, version))
    return raw ? ({ edits: {}, openFiles: [], ...JSON.parse(raw) } as ExamState) : null
  } catch {
    return null
  }
}

export function saveExam(id: string, version: number, state: ExamState) {
  try {
    localStorage.setItem(key(id, version), JSON.stringify(state))
  } catch {
    // Storage full or blocked: the attempt still works, it just won't survive a refresh.
  }
}

export function clearExam(id: string, version: number) {
  try {
    localStorage.removeItem(key(id, version))
  } catch {
    /* ignore */
  }
}

export function examPhase(id: string, version: number): Phase | null {
  return loadExam(id, version)?.phase ?? null
}

export async function examCall<T>(id: string, action: 'run' | 'complete', body: unknown = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/exam/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not reach the exam service. Start the app with `npm run dev` in literacy/frontend.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.error) {
    throw new Error(data?.error ?? `The exam service answered ${res.status}. It runs only under \`npm run dev\`.`)
  }
  return data as T
}

export function downloadHtml(filename: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "tests/test_refunds.py::test_full_refund_in_one_go" -> "test_full_refund_in_one_go" */
export const testName = (nodeid: string) => nodeid.split('::').pop() ?? nodeid
