export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1F4FD8" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />
    </svg>
  )
}

export function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2.5 text-base font-semibold text-ink">
      <LogoMark />
      <span>ReadCode</span>
    </a>
  )
}
