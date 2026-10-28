import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getChoice, setChoice } from '../lib/theme'
import type { ThemeChoice } from '../lib/theme'

const THEMES: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  { value: 'dark', label: 'Dark', icon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /> },
  { value: 'system', label: 'Match system', icon: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></> },
]

const Icon = ({ children, size = 14 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" className="flex-none">
    {children}
  </svg>
)

/** Gear button with a dropdown of settings. Theme is the first section; more can be added below it. */
export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(getChoice)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const pick = (t: ThemeChoice) => { setTheme(t); setChoice(t) }

  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
        aria-label="Settings" title="Settings"
        className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-chip hover:text-ink ${open ? 'bg-chip text-ink' : 'text-muted'}`}>
        <Icon size={17}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </Icon>
      </button>
      {open && (
        <div role="dialog" aria-label="Settings"
          className="absolute right-0 top-10 z-50 w-56 rounded-lg bg-surface p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.28)] ring-1 ring-line">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted">THEME</div>
          <div role="radiogroup" aria-label="Theme" className="flex flex-col">
            {THEMES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => pick(t.value)}
                className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[13.5px] hover:bg-chip ${theme === t.value ? 'text-ink' : 'text-ink/80'}`}>
                <Icon>{t.icon}</Icon>
                <span className="flex-1">{t.label}</span>
                {theme === t.value && <Icon><path d="M5 12.5l4.5 4.5L19 7" /></Icon>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
