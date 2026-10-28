import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canReveal, scoreExercise } from './score'
import { emptyAnswers } from './storage'
import type { Answers, PublicExercise, Reveal } from './types'

// readcode-006 has 15 required points: Q1 2, Q2 2, Q3 2, Q4 3, Q5 1, Q6 2, Q7 2, Q8 1.
const EX = resolve(__dirname, '../../../examples/readcode-006')
const pub: PublicExercise = JSON.parse(readFileSync(resolve(EX, 'public.json'), 'utf8'))
const key = JSON.parse(readFileSync(resolve(EX, 'key.json'), 'utf8'))
const reveal: Reveal = {
  bug_questions: ['Q4'],
  after_bug: key.reveal_after_bug,
  answers: Object.fromEntries(pub.questions.map((q) => [q.id,
    key.rubric.filter((r: { question_id: string }) => r.question_id === q.id).map((r: { id: string; kind: string; point: string }) => ({ id: r.id, kind: r.kind, point: r.point }))])),
}
const ids = (qid: string, kind: string) => reveal.answers[qid].filter((p) => p.kind === kind).map((p) => p.id)
const answers = (patch: Partial<Answers>): Answers => ({ ...emptyAnswers(), ...patch })

describe('score', () => {
  it("scores John's real submission: Q1 solved, two \"I don't know\"s", () => {
    const s = scoreExercise(pub, reveal, answers({
      answers: { Q1: 'put_nowait c raises QueueFull ...', Q2: "hmm I don't know.", Q3: "I don't know." },
      results: { Q1: { state: 'submitted', ticked: ids('Q1', 'required') }, Q2: { state: 'submitted', ticked: [] }, Q3: { state: 'submitted', ticked: [] }, Q4: { state: 'conceded', ticked: [] } },
    }))
    expect(s.requiredTotal).toBe(15)
    expect(s.requiredMet).toBe(2)
    expect(s.percent).toBe(13.3)
    expect(s.questions.find((q) => q.id === 'Q1')?.label).toBe('Solved')
    expect(s.questions.find((q) => q.id === 'Q2')?.label).toBe('Not solved')
    expect(s.questions.find((q) => q.id === 'Q8')?.label).toBe('Not answered')
  })

  it('takes hint costs off the question, never below zero, and counts bonus separately', () => {
    const s = scoreExercise(pub, reveal, answers({
      hintsUsed: { Q4: 2, Q8: 1 },
      results: {
        Q4: { state: 'submitted', ticked: [...ids('Q4', 'required'), ...ids('Q4', 'bonus').slice(0, 1)] },
        Q8: { state: 'submitted', ticked: [] },
      },
    }))
    const q4 = s.questions.find((q) => q.id === 'Q4')!
    expect([q4.requiredMet, q4.hintCost, q4.points, q4.bonusMet]).toEqual([3, 3, 0, 1]) // hints 1 + 2 cost 3
    expect(q4.label).toBe('Solved with 2 hints')
    expect(s.questions.find((q) => q.id === 'Q8')!.points).toBe(0) // 0 met - 0.5 cost floors at 0
  })

  it('a conceded question scores 0 even if points were ticked', () => {
    const s = scoreExercise(pub, reveal, answers({ results: { Q2: { state: 'conceded', ticked: ids('Q2', 'required') } } }))
    expect(s.requiredMet).toBe(0)
    expect(s.questions.find((q) => q.id === 'Q2')!.label).toBe('Learned from the answer')
  })

  it('holds back answers that give the bug away until the bug question is done', () => {
    expect(canReveal(reveal, answers({}), 'Q3')).toBe(false)
    expect(canReveal(reveal, answers({}), 'Q2')).toBe(true)
    expect(canReveal(reveal, answers({ results: { Q4: { state: 'conceded', ticked: [] } } }), 'Q3')).toBe(true)
  })
})
