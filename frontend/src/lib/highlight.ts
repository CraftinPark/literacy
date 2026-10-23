// Minimal C syntax colouring: enough to read comfortably, no dependencies.
// Returns one token list per source line (block comments can span lines).

export type TokenKind = 'kw' | 'const' | 'num' | 'str' | 'com' | 'pre' | 'plain'
export interface Token {
  kind: TokenKind
  text: string
}

const KEYWORDS = new Set(
  `auto break case char const continue default do double else enum extern float for goto if inline int long
   register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while
   _Bool bool`.split(/\s+/),
)
const CONSTANTS = new Set(['NULL', 'true', 'false'])

const TOKEN = new RegExp(
  [
    String.raw`(?<com>//.*|/\*[\s\S]*?(?:\*/|$))`,
    String.raw`(?<str>"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)`,
    String.raw`(?<num>\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?)[uUlLfF]*\b)`,
    String.raw`(?<word>[A-Za-z_]\w*)`,
  ].join('|'),
  'g',
)

function classify(word: string): TokenKind {
  if (KEYWORDS.has(word) || /_t$/.test(word)) return 'kw'
  if (CONSTANTS.has(word) || /^[A-Z][A-Z0-9_]{2,}$/.test(word)) return 'const'
  return 'plain'
}

export function highlightC(source: string): Token[][] {
  const lines: Token[][] = [[]]
  const push = (kind: TokenKind, text: string) => {
    const parts = text.split('\n')
    parts.forEach((p, i) => {
      if (i > 0) lines.push([])
      if (p) lines[lines.length - 1].push({ kind, text: p })
    })
  }
  let last = 0
  // Preprocessor lines are coloured whole.
  const src = source.replace(/\r\n/g, '\n')
  const pre = /^[ \t]*#.*$/gm
  const preRanges: [number, number][] = []
  for (let m; (m = pre.exec(src)); ) preRanges.push([m.index, m.index + m[0].length])
  const inPre = (i: number) => preRanges.find(([a, b]) => i >= a && i < b)

  TOKEN.lastIndex = 0
  for (let m; (m = TOKEN.exec(src)); ) {
    const p = inPre(m.index)
    if (p && !m.groups!.com) {
      if (p[0] >= last) {
        push('plain', src.slice(last, p[0]))
        push('pre', src.slice(p[0], p[1]))
        last = p[1]
      }
      TOKEN.lastIndex = Math.max(TOKEN.lastIndex, p[1])
      continue
    }
    if (m.index < last) continue
    push('plain', src.slice(last, m.index))
    const g = m.groups!
    const kind: TokenKind = g.com ? 'com' : g.str ? 'str' : g.num ? 'num' : classify(m[0])
    push(kind, m[0])
    last = m.index + m[0].length
  }
  push('plain', src.slice(last))
  return lines
}
