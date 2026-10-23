// Builds the sidebar outline from C source: banner comments become sections,
// column-0 function definitions become entries.

export interface OutlineFunction {
  name: string
  line: number
  end: number
}

export interface OutlineSection {
  title: string
  line: number
  functions: OutlineFunction[]
}

const RULE = /^\/\*\s*-{10,}\s*\*\/\s*$/
const BANNER = /^\/\*\s*(.+?)\s*\*\/\s*$/
const DEF_START = /^(?!typedef\b|struct\b|enum\b|union\b|#|\/\*|\s)[A-Za-z_][\w\s*]*?\b([A-Za-z_]\w*)\s*\(/

export function parseOutline(lines: string[]): OutlineSection[] {
  const sections: OutlineSection[] = []
  let current: OutlineSection | null = null

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    if (RULE.test(ln) && i + 1 < lines.length) {
      const m = BANNER.exec(lines[i + 1])
      if (m && !RULE.test(lines[i + 1])) {
        // "Internal helpers (caller must hold c->lock)" -> "Internal helpers"
        current = { title: m[1].replace(/\s*\(.*\)\s*$/, ''), line: i + 1, functions: [] }
        sections.push(current)
        i += 2
        continue
      }
    }
    const def = DEF_START.exec(ln)
    if (!def) continue
    // A definition reaches "{" before ";" (a prototype reaches ";" first).
    let j = i
    while (j < lines.length && !/[{;]\s*$/.test(lines[j])) j++
    if (j >= lines.length || /;\s*$/.test(lines[j])) continue
    let end = j
    while (end < lines.length && lines[end] !== '}') end++
    if (!current) {
      current = { title: 'Top of file', line: 1, functions: [] }
      sections.push(current)
    }
    current.functions.push({ name: def[1], line: i + 1, end: Math.min(end + 1, lines.length) })
    i = end
  }
  return sections
}

export function allFunctions(sections: OutlineSection[]): OutlineFunction[] {
  return sections.flatMap((s) => s.functions)
}

export function functionAt(sections: OutlineSection[], line: number): OutlineFunction | undefined {
  return allFunctions(sections).find((f) => f.line <= line && line <= f.end)
}
