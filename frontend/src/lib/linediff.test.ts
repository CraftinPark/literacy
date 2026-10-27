import { describe, expect, it } from 'vitest'
import { diffLines, lineMap, toCurrentRange, toOriginalRange, unifiedDiff } from './linediff'

const orig = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n')

/** Apply a unified diff produced by unifiedDiff (no fuzz) to check it round-trips. */
function applyPatch(original: string, patch: string): string {
  const src = original.split('\n')
  const out: string[] = []
  let at = 0
  for (const line of patch.split('\n').slice(2)) {
    const h = /^@@ -(\d+),(\d+)/.exec(line)
    if (h) {
      const start = Number(h[2]) === 0 ? Number(h[1]) : Number(h[1]) - 1
      while (at < start) out.push(src[at++])
      continue
    }
    if (line.startsWith(' ')) { out.push(src[at++]) } else if (line.startsWith('-')) { at++ } else if (line.startsWith('+')) { out.push(line.slice(1)) }
  }
  while (at < src.length) out.push(src[at++])
  return out.join('\n')
}

describe('lineMap', () => {
  it('is the identity when nothing changed', () => {
    const m = lineMap(orig, orig)
    expect(m.toCurrent.slice(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('shifts lines below an insertion and marks the added lines', () => {
    const cur = ['// note', '// note 2', ...orig.split('\n')].join('\n')
    const m = lineMap(orig, cur)
    expect(m.toCurrent[1]).toBe(3)
    expect(m.toCurrent[10]).toBe(12)
    expect(m.toOriginal[1]).toBe(0)
    expect(m.toOriginal[3]).toBe(1)
  })

  it('maps a range across a deletion and an edit inside it', () => {
    const cur = orig.replace('d\n', '').replace('f', 'F')
    const m = lineMap(orig, cur)
    // original 3..7 = c d e f g; now c e F g -> c at 3, g at 6
    expect(toCurrentRange(m, 3, 7)).toEqual({ start: 3, end: 6, removed: false })
  })

  it('flags a range whose lines were all deleted and parks it on the next surviving line', () => {
    const cur = orig.replace('d\ne\n', '')
    const m = lineMap(orig, cur)
    expect(toCurrentRange(m, 4, 5)).toEqual({ start: 4, end: 4, removed: true }) // f is now line 4
  })

  it('maps a selection back to original lines, skipping added lines', () => {
    const cur = orig.replace('c\n', 'c\nNEW1\nNEW2\n')
    const m = lineMap(orig, cur)
    expect(toOriginalRange(m, 3, 6)).toEqual({ start: 3, end: 4 }) // c, NEW1, NEW2, d
    expect(toOriginalRange(m, 4, 5)).toEqual({ start: 4, end: 4 }) // only added lines: nearest original after
  })
})

describe('unifiedDiff', () => {
  it('is empty when nothing changed', () => {
    expect(unifiedDiff(orig, orig, 'x.ts')).toBe('')
  })

  it('produces a patch that reproduces the edited text', () => {
    const cur = orig.replace('b', 'B // why?').replace('i\n', '').concat('\nk')
    const patch = unifiedDiff(orig, cur, 'x.ts')
    expect(patch.startsWith('--- a/x.ts\n+++ b/x.ts\n@@ -1,')).toBe(true)
    expect(patch).toContain('-b\n+B // why?')
    expect(applyPatch(orig, patch)).toBe(cur)
  })

  it('keeps distant changes in separate hunks', () => {
    const long = Array.from({ length: 40 }, (_, k) => `line ${k + 1}`).join('\n')
    const cur = long.replace('line 2\n', 'line 2 changed\n').replace('line 35\n', 'line 35 changed\n')
    const patch = unifiedDiff(long, cur, 'y.ts')
    expect(patch.match(/^@@/gm)?.length).toBe(2)
    expect(applyPatch(long, patch)).toBe(cur)
  })

  it('handles pure insertion at the top and deletion at the end', () => {
    const cur = 'top\n' + orig.replace('\nj', '')
    expect(applyPatch(orig, unifiedDiff(orig, cur, 'z.ts'))).toBe(cur)
    expect(diffLines(['x'], []).map((o) => o.kind)).toEqual(['del'])
  })
})
