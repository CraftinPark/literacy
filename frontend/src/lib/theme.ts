// Light / dark theme. The choice ('system' follows the OS) is remembered per browser; the resolved
// theme is set as data-theme on <html>, which switches the CSS variables in src/theme.css.
// index.html applies the stored choice before first paint so the page never flashes the wrong theme.

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'readcode:theme'
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null
const listeners = new Set<(t: Theme) => void>()

export function getChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function currentTheme(): Theme {
  const choice = getChoice()
  if (choice !== 'system') return choice
  return media?.matches ? 'light' : 'dark'
}

function apply() {
  const t = currentTheme()
  document.documentElement.dataset.theme = t
  for (const fn of listeners) fn(t)
}

export function setChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  apply()
}

/** Calls `fn` whenever the resolved theme changes. Returns an unsubscribe function. */
export function onThemeChange(fn: (t: Theme) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

media?.addEventListener('change', () => { if (getChoice() === 'system') apply() })
