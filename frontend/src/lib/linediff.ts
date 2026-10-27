// Line-level diff between an exercise file as shipped and the candidate's edited copy.
// Comments are stored against the ORIGINAL line numbers (what the answer key uses); these
// helpers move them to where that code is now, and back, and render edits as a unified diff.

export type Op = { kind: 'same' | 'del' | 'add'; a: number; b: number } // a/b: 0-based line index in each side

/** Longest-common-subsequence diff of two line arrays (common prefix/suffix trimmed first). */
export function diffLines(a: string[], b: string[]): Op[] {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const A = a.slice(pre, a.length - suf)
  const B = b.slice(pre, b.length - suf)
  const n = A.length
  const m = B.length
  // lcs[i][j] = LCS length of A[i..] and B[j..], stored flat.
  const lcs = new Uint32Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] = A[i] === B[j] ? lcs[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1])
    }
  }
  const ops: Op[] = []
  for (let k = 0; k < pre; k++) ops.push({ kind: 'same', a: k, b: k })
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { ops.push({ kind: 'same', a: pre + i++, b: pre + j++ }); continue }
    if (j < m && (i === n || lcs[i * (m + 1) + j + 1] > lcs[(i + 1) * (m + 1) + j])) ops.push({ kind: 'add', a: pre + i, b: pre + j++ })
    else ops.push({ kind: 'del', a: pre + i++, b: pre + j })
  }
  for (let k = 0; k < suf; k++) ops.push({ kind: 'same', a: a.length - suf + k, b: b.length - suf + k })
  return ops
}

export interface LineMap {
  /** 1-based original line -> 1-based current line, or 0 if the line was deleted. Index 0 unused. */
  toCurrent: number[]
  /** 1-based current line -> 1-based original line, or 0 if the line was added. Index 0 unused. */
  toOriginal: number[]
}

export function lineMap(original: string, current: string): LineMap {
  const a = original.split('\n')
  const b = current.split('\n')
  const toCurrent = new Array<number>(a.length + 1).fill(0)
  const toOriginal = new Array<number>(b.length + 1).fill(0)
  if (original === current) {
    for (let k = 1; k <= a.length; k++) toCurrent[k] = toOriginal[k] = k
    return { toCurrent, toOriginal }
  }
  for (const op of diffLines(a, b)) {
    if (op.kind === 'same') { toCurrent[op.a + 1] = op.b + 1; toOriginal[op.b + 1] = op.a + 1 }
  }
  return { toCurrent, toOriginal }
}

/** Nearest surviving line at or after `line` (else before) in a 1-based map; 1 if none survive. */
function nearest(map: number[], line: number): number {
  for (let k = line; k < map.length; k++) if (map[k]) return map[k]
  for (let k = line - 1; k >= 1; k--) if (map[k]) return map[k]
  return 1
}

/**
 * Where an original range [start, end] is now. `removed` is true when every line of it was deleted;
 * the range then collapses onto the nearest surviving line.
 */
export function toCurrentRange(m: LineMap, start: number, end: number): { start: number; end: number; removed: boolean } {
  const kept = []
  for (let k = start; k <= end; k++) if (m.toCurrent[k]) kept.push(m.toCurrent[k])
  if (!kept.length) { const at = nearest(m.toCurrent, start); return { start: at, end: at, removed: true } }
  return { start: Math.min(...kept), end: Math.max(...kept), removed: false }
}

/** The original range covering a current range. Lines the candidate added map to their nearest original line. */
export function toOriginalRange(m: LineMap, start: number, end: number): { start: number; end: number } {
  const kept = []
  for (let k = start; k <= end; k++) if (m.toOriginal[k]) kept.push(m.toOriginal[k])
  if (!kept.length) { const at = nearest(m.toOriginal, start); return { start: at, end: at } }
  return { start: Math.min(...kept), end: Math.max(...kept) }
}

/** Unified diff (3 lines of context), or '' if nothing changed. */
export function unifiedDiff(original: string, current: string, path: string, context = 3): string {
  if (original === current) return ''
  const a = original.split('\n')
  const b = current.split('\n')
  const ops = diffLines(a, b)
  const changed = ops.map((o) => o.kind !== 'same')
  const out = [`--- a/${path}`, `+++ b/${path}`]
  let k = 0
  while (k < ops.length) {
    if (!changed[k]) { k++; continue }
    // Grow a hunk around this change, merging changes closer than 2*context apart.
    let from = Math.max(0, k - context)
    let to = k
    while (to < ops.length) {
      let next = to
      while (next < ops.length && !changed[next]) next++
      if (next >= ops.length || next - to > 2 * context) break
      to = next
      while (to < ops.length && changed[to]) to++
    }
    to = Math.min(ops.length, to + context)
    const hunk = ops.slice(from, to)
    const aStart = hunk.find((o) => o.kind !== 'add')?.a ?? hunk[0].a
    const bStart = hunk.find((o) => o.kind !== 'del')?.b ?? hunk[0].b
    const aLen = hunk.filter((o) => o.kind !== 'add').length
    const bLen = hunk.filter((o) => o.kind !== 'del').length
    out.push(`@@ -${aLen ? aStart + 1 : aStart},${aLen} +${bLen ? bStart + 1 : bStart},${bLen} @@`)
    for (const o of hunk) out.push(o.kind === 'same' ? ` ${a[o.a]}` : o.kind === 'del' ? `-${a[o.a]}` : `+${b[o.b]}`)
    from = to
    k = to
  }
  return out.join('\n') + '\n'
}
