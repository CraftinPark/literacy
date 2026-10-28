import type { BugReport } from '../lib/types'
import { HintList } from './QuestionHelp'

/**
 * A bug report shown above a bugs question, written like a ticket: what was seen, how to reproduce it,
 * expected vs observed (lines that differ are marked), and hints that open one at a time at a cost.
 */
export function BugReportCard({ report, hintsUsed, onOpenHint }: {
  report: BugReport
  hintsUsed: number
  onOpenHint: () => void
}) {
  const expected = new Set(report.expected)
  const observed = new Set(report.observed)

  const Lines = ({ lines, other, tone }: { lines: string[]; other: Set<string>; tone: 'ok' | 'bad' }) => (
    <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-md bg-field px-3 py-2 font-mono text-[12px] leading-[1.6] text-ink">
      {lines.map((l, i) => (
        <div key={i} className={other.has(l) ? '' : tone === 'ok' ? 'text-ok' : 'text-danger'}>{l}</div>
      ))}
    </pre>
  )

  return (
    <article className="flex flex-col gap-3 rounded-[10px] bg-surface p-4" aria-label="Bug report">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-sec-bugs">BUG REPORT</span>
        <h3 className="text-[16px] font-semibold leading-snug text-ink">{report.title}</h3>
      </div>
      <p className="text-[14px] leading-[1.55] text-ink/85">{report.context}</p>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Steps to reproduce</span>
        <ol className="ml-5 list-decimal text-[13.5px] leading-[1.55] text-ink/85">
          {report.steps.map((s, i) => <li key={i} className="pl-1">{s}</li>)}
        </ol>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Expected</span>
        <Lines lines={report.expected} other={observed} tone="ok" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Observed</span>
        <Lines lines={report.observed} other={expected} tone="bad" />
      </div>

      <HintList hints={report.hints} used={hintsUsed} onOpen={onOpenHint} />
    </article>
  )
}
