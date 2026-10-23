// Autosave: the candidate's work lives in localStorage until submitted.
import type { Answers } from './types'

const key = (id: string, version: number) => `readcode:answers:${id}:v${version}`

export function emptyAnswers(): Answers {
  return { startedAt: Date.now(), comprehension: {}, design: {}, comments: [], improvements: [] }
}

export function loadAnswers(id: string, version: number): Answers | null {
  try {
    const raw = localStorage.getItem(key(id, version))
    return raw ? { ...emptyAnswers(), ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

export function saveAnswers(id: string, version: number, a: Answers) {
  try {
    localStorage.setItem(key(id, version), JSON.stringify(a))
  } catch {
    // Storage full or blocked: the session still works, it just won't survive a refresh.
  }
}

export function clearAnswers(id: string, version: number) {
  try {
    localStorage.removeItem(key(id, version))
  } catch {
    /* ignore */
  }
}

export function hasProgress(id: string, version: number): boolean {
  const a = loadAnswers(id, version)
  return !!a && (a.comments.length > 0 || Object.values({ ...a.comprehension, ...a.design }).some((v) => v.trim()) || a.improvements.length > 0)
}
