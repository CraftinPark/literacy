import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { highlightC } from './highlight'
import { allFunctions, functionAt, parseOutline } from './outline'
import { buildSubmission } from './submission'
import type { Answers, PublicExercise } from './types'

const ROOT = resolve(__dirname, '../../..')
const EX = resolve(ROOT, 'examples/readcode-001')
const source = readFileSync(resolve(EX, 'code/lru_cache.c'), 'utf8')
const lines = source.split('\n')
const pub: PublicExercise = JSON.parse(readFileSync(resolve(EX, 'public.json'), 'utf8'))

describe('outline', () => {
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

describe('highlight', () => {
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

  const answers: Answers = {
    startedAt: Date.parse('2026-10-13T10:00:00Z'),
    comprehension: { C1: 'A hash table and a list.', C2: '   ' },
    design: { D1: 'Shard it.' },
    comments: [
      { id: 'c1', type: 'bug', ranges: [{ file: 'lru_cache.c', start_line: 198, end_line: 202 }], text: 'use after free',
        severity: 'critical', confidence: 'certain', fix: 'call back first', function: 'evict_tail' },
      { id: 'c2', type: 'question', ranges: [{ file: 'lru_cache.c', start_line: 10, end_line: 10 }], text: 'why?' },
      { id: 'c3', type: 'design', ranges: [{ file: 'lru_cache.c', start_line: 20, end_line: 22 }], text: 'global lock' },
      { id: 'c4', type: 'improvement', ranges: [{ file: 'lru_cache.c', start_line: 30, end_line: 30 }], text: 'add remove_entry()' },
      { id: 'c5', type: 'bug', ranges: [{ file: 'lru_cache.c', start_line: 40, end_line: 40 }], text: '  ' },
    ],
    improvements: [{ id: 'i1', title: 'Add tests', detail: '' }],
  }
  const sub = buildSubmission(pub, answers, 'local', new Date('2026-10-13T10:30:00Z'))

  it('matches submission.schema.json', () => {
    expect(validate(sub), JSON.stringify(validate.errors)).toBe(true)
  })

  it('maps comment types to the right sections and drops blanks', () => {
    expect(sub.comprehension).toEqual({ C1: 'A hash table and a list.' })
    expect(sub.bugs.map((b) => b.id)).toEqual(['c1'])
    expect(sub.notes.map((n) => [n.id, n.type])).toEqual([['c2', 'question'], ['c3', 'design']])
    expect(sub.improvements.map((i) => i.title)).toEqual(['Add tests', 'add remove_entry()'])
    expect(sub.time_spent_minutes).toBe(30)
  })

  it('validates an empty submission too', () => {
    const empty = buildSubmission(pub, { ...answers, comprehension: {}, design: {}, comments: [], improvements: [] }, 'x')
    expect(validate(empty), JSON.stringify(validate.errors)).toBe(true)
  })
})
