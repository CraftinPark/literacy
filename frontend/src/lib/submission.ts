// Turns the candidate's work into a submission (schemas/submission.schema.json),
// the file the grader reads.
import { unifiedDiff } from './linediff'
import type { Answers, PublicExercise, Range } from './types'

export interface Submission {
  schema_version: 2
  exercise_id: string
  exercise_version: number
  candidate_id: string
  submitted_at: string
  time_spent_minutes: number
  answers: Record<string, string>
  bugs: {
    id: string
    locations: Range[]
    function?: string
    severity: string
    confidence: string
    explanation: string
    fix?: string
  }[]
  improvements: { title: string; detail?: string; locations?: Range[] }[]
  notes: { id: string; type: 'question' | 'design'; locations: Range[]; text: string }[]
  edits: { file: string; patch: string }[]
}

const nonEmpty = (rec: Record<string, string>) =>
  Object.fromEntries(Object.entries(rec).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))

function firstLine(text: string, max = 80) {
  const line = text.trim().split('\n')[0]
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

/** `sources` are the files as shipped; edits become unified diffs against them (ungraded scratch work). */
export function buildSubmission(ex: PublicExercise, a: Answers, sources: Record<string, string>, candidateId: string, now = new Date()): Submission {
  const comments = a.comments.filter((c) => c.text.trim())
  return {
    schema_version: 2,
    exercise_id: ex.id,
    exercise_version: ex.version,
    candidate_id: candidateId,
    submitted_at: now.toISOString(),
    time_spent_minutes: Math.max(0, Math.round((now.getTime() - a.startedAt) / 6000) / 10),
    answers: nonEmpty(a.answers),
    bugs: comments
      .filter((c) => c.type === 'bug')
      .map((c) => ({
        id: c.id,
        locations: c.ranges,
        ...(c.function ? { function: c.function } : {}),
        severity: c.severity ?? 'medium',
        confidence: c.confidence ?? 'guess',
        explanation: c.text.trim(),
        ...(c.fix?.trim() ? { fix: c.fix.trim() } : {}),
      })),
    improvements: [
      ...a.improvements
        .filter((i) => i.title.trim())
        .map((i) => ({ title: i.title.trim(), ...(i.detail.trim() ? { detail: i.detail.trim() } : {}) })),
      ...comments
        .filter((c) => c.type === 'improvement')
        .map((c) => ({ title: firstLine(c.text), detail: c.text.trim(), locations: c.ranges })),
    ],
    notes: comments
      .filter((c) => c.type === 'question' || c.type === 'design')
      .map((c) => ({ id: c.id, type: c.type as 'question' | 'design', locations: c.ranges, text: c.text.trim() })),
    edits: ex.files
      .map((f) => ({ file: f.path, patch: f.path in a.edits ? unifiedDiff(sources[f.path], a.edits[f.path], f.path) : '' }))
      .filter((e) => e.patch),
  }
}
