import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { highlight, highlightC } from './highlight'
import { allFunctions, functionAt, parseOutline } from './outline'
import { buildSubmission } from './submission'
import type { Answers, PublicExercise } from './types'

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

describe('highlight (TypeScript)', () => {
  const src = ts('worker.ts')
  const tokens = highlight(src, 'typescript')
  const kinds = (n: number) => Object.fromEntries(tokens[n - 1].map((t) => [t.text, t.kind]))

  it('keeps every character and line', () => {
    const ls = src.split('\n')
    expect(tokens.length).toBe(ls.length)
    tokens.forEach((t, i) => expect(t.map((x) => x.text).join('')).toBe(ls[i]))
  })

  it('colours keywords, strings and template literals', () => {
    expect(kinds(299)).toMatchObject({ async: 'kw' })
    expect(kinds(1)).toMatchObject({ import: 'kw', "'node:events'": 'str' })
    expect(tokens[178].some((t) => t.kind === 'str' && t.text.startsWith('`'))).toBe(true)
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

describe('highlight (C)', () => {
  const tokens = highlightC(source)

  it('keeps every character and line', () => {
    expect(tokens.length).toBe(lines.length)
    tokens.forEach((t, i) => expect(t.map((x) => x.text).join('')).toBe(lines[i]))
  })

  it('colours keywords, constants and comments', () => {
    const kinds = (n: number) => Object.fromEntries(tokens[n - 1].map((t) => [t.text, t.kind]))
    expect(kinds(185)).toMatchObject({ static: 'kw', void: 'kw' })
    expect(kinds(29)['/* Types                                                              */']).toBe('com')
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
  }
  const sub = buildSubmission(pub, answers, 'local', new Date('2026-10-13T10:30:00Z'))

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
  })

  it('validates an empty submission too', () => {
    const empty = buildSubmission(pub, { ...answers, answers: {}, comments: [], improvements: [] }, 'x')
    expect(validate(empty), JSON.stringify(validate.errors)).toBe(true)
  })
})
