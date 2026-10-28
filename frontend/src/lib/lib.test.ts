import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { allFunctions, functionAt, parseOutline } from './outline'
import { buildSubmission } from './submission'
import type { Answers, PublicExercise, Reveal } from './types'

const ROOT = resolve(__dirname, '../../..')
// The C parser is tested on the archived v1 example; everything else on readcode-002.
const source = readFileSync(resolve(ROOT, 'archive/readcode-001/code/lru_cache.c'), 'utf8')
const lines = source.split('\n')
const EX = resolve(ROOT, 'examples/readcode-002')
const pub: PublicExercise = JSON.parse(readFileSync(resolve(EX, 'public.json'), 'utf8'))
const ts = (f: string) => readFileSync(resolve(EX, 'code', f), 'utf8')

describe('outline (TypeScript)', () => {
  const worker = parseOutline(ts('worker.ts').split('\n'), 'typescript')
  const lockManager = parseOutline(ts('lock-manager.ts').split('\n'), 'typescript')

  it('makes classes sections and methods entries', () => {
    expect(worker.map((s) => s.title)).toEqual(['class Worker'])
    const fns = Object.fromEntries(allFunctions(worker).map((f) => [f.name, f.line]))
    expect(fns).toMatchObject({ constructor: 55, run: 108, mainLoop: 157, processJob: 299, handleFailed: 405 })
    expect(fns).not.toHaveProperty('if')
  })

  it('handles empty one-line bodies and maps lines to methods', () => {
    expect(allFunctions(lockManager).map((f) => f.name)).toEqual(
      ['constructor', 'start', 'extendLocks', 'startLockExtenderTimer', 'close', 'trackJob', 'untrackJob'])
    expect(functionAt(worker, 334)?.name).toBe('processJob')
    expect(functionAt(worker, 200)?.name).toBe('mainLoop')
  })
})

describe('outline (Python)', () => {
  const src = [
    'import heapq',
    '',
    'class QueueFull(Exception):',
    '    pass',
    '',
    'class Queue:',
    '    def __init__(self, maxsize=0):',
    '        self._maxsize = maxsize',
    '',
    '    async def put(self, item):',
    '        while self.full():',
    '            pass',
    '',
    'def helper():',
    '    return 1',
  ]
  const sections = parseOutline(src, 'python')

  it('makes classes sections, methods entries and top-level functions a Functions section', () => {
    expect(sections.map((s) => s.title)).toEqual(['class QueueFull', 'class Queue', 'Functions'])
    expect(sections[1].functions.map((f) => [f.name, f.line, f.end])).toEqual([['__init__', 7, 8], ['put', 10, 12]])
    expect(sections[2].functions.map((f) => f.name)).toEqual(['helper'])
  })
})

describe('outline (C)', () => {
  const sections = parseOutline(lines)

  it('finds the banner sections', () => {
    expect(sections.map((s) => s.title)).toEqual(['Types', 'Internal helpers', 'Public API', 'Demo driver'])
  })

  it('finds function definitions with their start lines', () => {
    const fns = Object.fromEntries(allFunctions(sections).map((f) => [f.name, f.line]))
    expect(fns).toMatchObject({ evict_tail: 185, lru_create: 209, lru_put: 257, lru_hit_ratio: 415, main: 466 })
    expect(fns).not.toHaveProperty('lru_evict_cb') // a typedef, not a function
  })

  it('maps a line to its function', () => {
    expect(functionAt(sections, 200)?.name).toBe('evict_tail')
    expect(functionAt(sections, 224)?.name).toBe('lru_create')
    expect(functionAt(sections, 30)).toBeUndefined()
  })
})

describe('submission', () => {
  const schema = JSON.parse(readFileSync(resolve(ROOT, 'schemas/submission.schema.json'), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)

  const f = 'worker.ts'
  const answers: Answers = {
    startedAt: Date.parse('2026-10-13T10:00:00Z'),
    answers: { Q1: 'Fetch, then process.', Q2: '   ', Q5: 'Every exit path.' },
    comments: [
      { id: 'c1', type: 'bug', ranges: [{ file: f, start_line: 334, end_line: 335 }, { file: 'lock-manager.ts', start_line: 150, end_line: 152 }],
        text: 'lock never renewed', severity: 'high', confidence: 'certain', fix: 'remove the untrack', function: 'processJob' },
      { id: 'c2', type: 'question', ranges: [{ file: f, start_line: 10, end_line: 10 }], text: 'why?' },
      { id: 'c3', type: 'design', ranges: [{ file: f, start_line: 20, end_line: 22 }], text: 'too many generics' },
      { id: 'c4', type: 'improvement', ranges: [{ file: f, start_line: 30, end_line: 30 }], text: 'factor out the retry blocks' },
      { id: 'c5', type: 'bug', ranges: [{ file: f, start_line: 40, end_line: 40 }], text: '  ' },
    ],
    improvements: [{ id: 'i1', title: 'Add tests', detail: '' }],
    hintsUsed: { Q4: 2, Q1: 0 },
    results: { Q1: { state: 'submitted', ticked: ['R23', 'R24'] }, Q5: { state: 'conceded', ticked: [] } },
    edits: { 'types.ts': ts('types.ts').replace('export type JobProgress', '// scratch note\nexport type JobProgress') },
  }
  const sources = Object.fromEntries(pub.files.map((f) => [f.path, ts(f.path)]))
  const key = JSON.parse(readFileSync(resolve(__dirname, '../../../examples/readcode-002/key.json'), 'utf8'))
  const reveal: Reveal = {
    bug_questions: ['Q4'], after_bug: key.reveal_after_bug,
    answers: Object.fromEntries(pub.questions.map((q) => [q.id, key.rubric.filter((r: { question_id: string }) => r.question_id === q.id)])),
  }
  const sub = buildSubmission(pub, answers, sources, 'local', reveal, new Date('2026-10-13T10:30:00Z'))

  it('matches submission.schema.json', () => {
    expect(validate(sub), JSON.stringify(validate.errors)).toBe(true)
  })

  it('maps comment types to the right sections and drops blanks', () => {
    expect(sub.answers).toEqual({ Q1: 'Fetch, then process.', Q5: 'Every exit path.' })
    expect(sub.bugs[0].locations.map((l) => l.file)).toEqual(['worker.ts', 'lock-manager.ts'])
    expect(sub.bugs.map((b) => b.id)).toEqual(['c1'])
    expect(sub.notes.map((n) => [n.id, n.type])).toEqual([['c2', 'question'], ['c3', 'design']])
    expect(sub.improvements.map((i) => i.title)).toEqual(['Add tests', 'factor out the retry blocks'])
    expect(sub.time_spent_minutes).toBe(30)
    expect(sub.edits.map((e) => e.file)).toEqual(['types.ts'])
    expect(sub.hints_used).toEqual({ Q4: 2 })
    expect(sub.edits[0].patch).toContain('+// scratch note')
    expect(sub.question_results.Q5.state).toBe('conceded')
    expect([sub.score.required_met, sub.score.required_total]).toEqual([2, 13])
  })

  it('validates an empty submission too', () => {
    const empty = buildSubmission(pub, { ...answers, answers: {}, comments: [], improvements: [], edits: {}, hintsUsed: {}, results: {} }, sources, 'x', reveal)
    expect(validate(empty), JSON.stringify(validate.errors)).toBe(true)
  })
})
