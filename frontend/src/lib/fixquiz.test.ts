import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { emptyExam, fileTree, isLocked, shuffled, testName } from './fixquiz'
import type { FixQuizExercise } from './fixquiz'

const ROOT = resolve(__dirname, '../../..')
const pub: FixQuizExercise = JSON.parse(readFileSync(resolve(ROOT, 'examples/readcode-004/public.json'), 'utf8'))

describe('fix-and-quiz', () => {
  it('readcode-004 public.json matches the schema the types describe', () => {
    const ajv = new Ajv2020({ allErrors: true })
    addFormats(ajv)
    const schema = JSON.parse(readFileSync(resolve(ROOT, 'schemas/fixquiz-public.schema.json'), 'utf8'))
    const ok = ajv.validate(schema, pub)
    expect(ajv.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })

  it('shuffles into a permutation that depends only on the seed', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(shuffled(items, 42)).toEqual(shuffled(items, 42))
    expect([...shuffled(items, 42)].sort()).toEqual(items)
    const orders = new Set(Array.from({ length: 50 }, (_, s) => shuffled(items, s).join('')))
    expect(orders.size).toBeGreaterThan(5)
  })

  it('gives every question its own complete option order', () => {
    const state = emptyExam(pub, 7)
    expect(state.phase).toBe('intro')
    for (const q of pub.quiz.questions) {
      expect([...state.order[q.id]].sort()).toEqual(q.options.map((o) => o.id).sort())
    }
  })

  it('builds the editor file tree: folders first, nested', () => {
    const tree = fileTree(pub.files.map((f) => f.path))
    expect(tree.map((n) => n.name)).toEqual(['tally', 'tests', 'pytest.ini', 'README.md'])
    const tally = tree[0].children!.map((n) => n.path)
    expect(tally).toContain('tally/payments.py')
    expect(tally.every((p) => p.startsWith('tally/'))).toBe(true)
  })

  it('locks tests and pytest config, nothing else', () => {
    expect(isLocked('tests/test_refunds.py')).toBe(true)
    expect(isLocked('pytest.ini')).toBe(true)
    expect(isLocked('tally/conftest.py')).toBe(true)
    expect(isLocked('tally/refunds.py')).toBe(false)
    expect(isLocked('README.md')).toBe(false)
  })

  it('never ships answers in the public file', () => {
    const text = JSON.stringify(pub)
    expect(text).not.toMatch(/"(answer|explanations|root_cause|hidden_tests_dir)"/)
    expect(testName('tests/test_refunds.py::test_full_refund_in_one_go')).toBe('test_full_refund_in_one_go')
  })
})
