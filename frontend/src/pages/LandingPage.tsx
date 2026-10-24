import { Logo } from '../components/Logo'

const STEPS = [
  { title: 'Understand', body: 'Explain what the code does and why it is built that way, in your own words.' },
  { title: 'Find bugs', body: 'Select the lines involved and say what goes wrong and why. Every bug is real and caught by a sanitizer or test.' },
  { title: 'Discuss design', body: 'Weigh the trade-offs: locking, ownership, memory accounting. There is rarely one right answer.' },
  { title: 'Suggest improvements', body: 'Go beyond fixes: structure, tests, API clarity, performance.' },
]

// A real excerpt from exercise 001 (lines 196-202), with the seeded use-after-free selected.
const PREVIEW: [number, string, boolean][] = [
  [196, '    c->stats.evictions++;', false],
  [197, '', false],
  [198, '    entry_free(victim);', true],
  [199, '', true],
  [200, '    if (c->on_evict)', true],
  [201, '        c->on_evict(victim->key, victim->value, victim->value_len,', true],
  [202, '                    c->evict_ctx);', true],
]

function kw(line: string) {
  return line.split(/\b(if)\b/).map((part, i) => (i % 2 ? <span key={i} className="text-code-kw">{part}</span> : part))
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center justify-between border-b border-line bg-white px-5">
        <Logo />
        <div className="flex items-center gap-2">
          <a href="#/playground" className="flex h-9 items-center rounded-lg border border-line-strong bg-white px-3.5 font-medium hover:border-ink">Playground</a>
          <a href="#/exercises" className="flex h-9 items-center rounded-lg bg-accent px-4 font-semibold text-white">Start practicing</a>
        </div>
      </header>

      <div className="mx-auto max-w-[1080px] px-4 py-16 md:py-24">
        <div className="mx-auto max-w-[760px] text-center">
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            Become code <span className="text-accent">fluent</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
            LeetCode in reverse. Instead of writing a solution, you read real code and review it. AI is solving the easy part,
            producing code. The part that can't be replaced is understanding it, evaluating it, and deciding whether it's right.
          </p>
          <a href="#/exercises" className="mt-8 inline-flex h-11 items-center rounded-lg bg-accent px-6 text-[15px] font-semibold text-white">
            Try exercise 001 →
          </a>
        </div>

        <div className="mt-16 overflow-hidden rounded-xl border border-line bg-code-bg shadow-[0_8px_28px_rgba(14,22,33,0.18)]">
          <div className="flex h-10 items-center justify-between border-b border-code-border bg-code-bar px-4 font-mono text-[12.5px] text-code-text">
            <span>lru_cache.c <span className="text-code-dim">› evict_tail()</span></span>
            <span className="font-sans text-code-dim">502 lines · read-only</span>
          </div>
          <div className="overflow-x-auto py-2.5">
            {PREVIEW.map(([n, text, sel]) => (
              <div key={n} className={`flex ${sel ? 'bg-[rgba(245,197,24,0.14)] shadow-[inset_3px_0_0_#F5C518]' : ''}`}>
                <span className={`w-14 flex-none pr-4 text-right font-mono text-code ${sel ? 'text-bug' : 'text-code-dim'}`}>{n}</span>
                <pre className="m-0 whitespace-pre font-mono text-code text-code-text">{text ? kw(text) : ' '}</pre>
              </div>
            ))}
            <div className="mb-3 ml-4 mr-4 mt-2.5 max-w-[640px] rounded-[10px] border border-bug bg-white px-4 py-3.5 text-ink md:ml-[72px]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Your comment</span>
                <span className="rounded bg-bug-soft px-2 py-0.5 font-mono text-xs font-medium">lines 198–202 · evict_tail</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-md bg-danger px-3 py-[5px] font-semibold text-white">Bug</span>
                <span className="rounded-md bg-ink px-[9px] py-[5px] font-semibold text-white">Critical</span>
                <span className="rounded-md bg-ink px-[9px] py-[5px] font-semibold text-white">Certain</span>
              </div>
              <p className="leading-[1.45]">
                entry_free(victim) runs first, then the callback reads victim-&gt;key and victim-&gt;value, which were just freed.
                That's a use-after-free. Call the callback before freeing the entry.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-[10px] border border-line bg-white p-4">
              <div className="flex items-center gap-2.5">
                <span className="h-[22px] w-[22px] flex-none rounded-full bg-accent text-center text-xs font-semibold leading-[22px] text-white">{i + 1}</span>
                <span className="font-semibold">{s.title}</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-[1.5] text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-line bg-white py-8 text-center text-xs text-muted">© 2026 ReadCode</footer>
    </div>
  )
}
