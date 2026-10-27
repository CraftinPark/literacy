// Shapes of public.json (schemas/public.schema.json) and of the candidate's in-progress work.

export type Dimension = 'understanding' | 'bugs' | 'design' | 'improvements'

export interface Concept {
  id: string // taxonomy id, e.g. backend.messaging.queues-consumers
  name: string
}

export interface ExerciseSummary {
  id: string
  version: number
  title: string
  language: string
  level: string
  estimated_minutes: number
  concepts: Concept[]
  line_count: number
}

export interface Question {
  id: string
  dimension: Dimension
  text: string
}

export interface PublicExercise extends Omit<ExerciseSummary, 'line_count'> {
  intro?: string
  files: { path: string; line_count: number }[]
  license: { spdx: string; attribution: string; source_url?: string }
  questions: Question[]
}

const LANGUAGE_LABEL: Record<string, string> = {
  c: 'C', cpp: 'C++', go: 'Go', java: 'Java', javascript: 'JavaScript', python: 'Python', rust: 'Rust', typescript: 'TypeScript',
}
/** "backend.messaging.queues-consumers" -> "messaging" */
export const conceptArea = (id: string) => id.split('.')[1] ?? ''

export const languageLabel = (l: string) => LANGUAGE_LABEL[l] ?? l

export type CommentType = 'bug' | 'question' | 'design' | 'improvement'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Confidence = 'guess' | 'fairly_sure' | 'certain'

export interface Range {
  file: string
  start_line: number
  end_line: number
}

export interface CodeComment {
  id: string
  type: CommentType
  ranges: Range[]
  text: string
  severity?: Severity
  confidence?: Confidence
  fix?: string
  function?: string
}

export interface Improvement {
  id: string
  title: string
  detail: string
}

export interface Answers {
  startedAt: number
  answers: Record<string, string> // question id -> text
  comments: CodeComment[] // ranges are ORIGINAL line numbers (see lib/linediff.ts)
  edits: Record<string, string> // file path -> edited text, only for files the candidate changed
  improvements: Improvement[]
}

export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical']
export const CONFIDENCES: Confidence[] = ['guess', 'fairly_sure', 'certain']
export const COMMENT_TYPES: CommentType[] = ['bug', 'question', 'design', 'improvement']

export const LABEL: Record<CommentType | Severity | Confidence, string> = {
  bug: 'Bug',
  question: 'Question',
  design: 'Design concern',
  improvement: 'Improvement',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
  guess: 'Guess',
  fairly_sure: 'Fairly sure',
  certain: 'Certain',
}

export function formatRanges(ranges: Range[], withFile = false): string {
  const span = (r: Range) => (r.start_line === r.end_line ? `${r.start_line}` : `${r.start_line}–${r.end_line}`)
  if (withFile || new Set(ranges.map((r) => r.file)).size > 1) return ranges.map((r) => `${r.file}:${span(r)}`).join(', ')
  return `${ranges.length === 1 && ranges[0].start_line === ranges[0].end_line ? 'line' : 'lines'} ${ranges.map(span).join(', ')}`
}
