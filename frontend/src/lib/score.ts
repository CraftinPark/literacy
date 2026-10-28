// Self-checked scoring. Per question: required points ticked minus the cost of the hints opened, never
// below 0; a conceded question scores 0. The exercise score is the sum as a percentage of all required
// points. Bonus points are counted separately and never make up for missing required ones.
import type { Answers, PublicExercise, Question, Reveal } from './types'

export type QuestionState = 'not-answered' | 'not-checked' | 'submitted' | 'conceded'

export interface QuestionScore {
  id: string
  state: QuestionState
  requiredTotal: number
  requiredMet: number
  bonusTotal: number
  bonusMet: number
  hintsUsed: number
  hintCost: number
  points: number
  label: string
}

export interface ExerciseScore {
  questions: QuestionScore[]
  percent: number
  requiredMet: number
  requiredTotal: number
  bonusMet: number
  bonusTotal: number
  hintCost: number
}

export const hintsOf = (q: Question) => q.report?.hints ?? q.hints ?? []

/** Whether a question's answer may be shown: held-back answers wait for the bug question(s). */
export function canReveal(reveal: Reveal, a: Answers, qid: string) {
  return !reveal.after_bug.includes(qid) || reveal.bug_questions.every((b) => !!a.results[b])
}

export function scoreQuestion(q: Question, reveal: Reveal, a: Answers): QuestionScore {
  const pts = reveal.answers[q.id] ?? []
  const required = pts.filter((p) => p.kind === 'required')
  const bonus = pts.filter((p) => p.kind === 'bonus')
  const result = a.results[q.id]
  const ticked = new Set(result?.state === 'submitted' ? result.ticked : [])
  const hintsUsed = a.hintsUsed[q.id] ?? 0
  const hintCost = hintsOf(q).slice(0, hintsUsed).reduce((n, h) => n + h.cost, 0)
  const requiredMet = required.filter((p) => ticked.has(p.id)).length
  const bonusMet = bonus.filter((p) => ticked.has(p.id)).length
  const state: QuestionState = result ? result.state : a.answers[q.id]?.trim() ? 'not-checked' : 'not-answered'
  const points = state === 'submitted' ? Math.max(0, requiredMet - hintCost) : 0
  const hintText = hintsUsed ? ` with ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}` : ''
  const label =
    state === 'conceded' ? 'Learned from the answer'
      : state === 'submitted' && !canReveal(reveal, a, q.id) ? 'Submitted, checked after the bug question'
      : state === 'not-answered' ? 'Not answered'
        : state === 'not-checked' ? 'Answered, not checked'
          : requiredMet === required.length ? `Solved${hintText}`
            : requiredMet > 0 ? `Partly solved${hintText}` : `Not solved${hintText}`
  return { id: q.id, state, requiredTotal: required.length, requiredMet, bonusTotal: bonus.length, bonusMet, hintsUsed, hintCost, points, label }
}

export function scoreExercise(ex: PublicExercise, reveal: Reveal, a: Answers): ExerciseScore {
  const questions = ex.questions.map((q) => scoreQuestion(q, reveal, a))
  const sum = (f: (s: QuestionScore) => number) => questions.reduce((n, s) => n + f(s), 0)
  const requiredTotal = sum((s) => s.requiredTotal)
  const earned = sum((s) => s.points)
  return {
    questions,
    percent: requiredTotal ? Math.round((earned / requiredTotal) * 1000) / 10 : 0,
    requiredMet: earned,
    requiredTotal,
    bonusMet: sum((s) => s.bonusMet),
    bonusTotal: sum((s) => s.bonusTotal),
    hintCost: sum((s) => s.hintCost),
  }
}
