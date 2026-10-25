import type { ReactNode } from 'react'
import { deltaClasses, type StatDelta } from './statDelta'
import { useRecentChange } from './useRecentChange'

type Tone = 'default' | 'good' | 'bad' | 'warn'

/*
 * Status is the one job chrome is allowed to spend a hue on, and `chartColors`
 * sets the rule: red means a problem. A figure that is fine gets no colour at
 * all — colouring every healthy number green makes green mean nothing, and
 * leaves the two figures that *are* a problem with nowhere louder to go. The
 * verdict line above the hero says "funded" in words.
 */
const toneClasses: Record<Tone, string> = {
  default: 'text-slate-900 dark:text-slate-50',
  good: 'text-slate-900 dark:text-slate-50',
  bad: 'text-rose-700 dark:text-rose-400',
  warn: 'text-amber-700 dark:text-amber-400',
}

function DeltaPill({ delta, prefix }: { delta: StatDelta; prefix?: string }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${deltaClasses[delta.direction]}`}
    >
      {prefix}
      {delta.text}
    </span>
  )
}

interface HeroStatProps {
  label: string
  value: ReactNode
  /** Small trailing word on the same baseline — "years old", "a year". */
  unit?: string
  sub?: ReactNode
  tone?: Tone
  /** The same figure read from the scenario being compared against. */
  compare?: { name: string; value: ReactNode; delta: StatDelta | null }
  /**
   * The numeric form of `value`. When it moves, the badge from
   * `describeChange` appears for a few seconds, so an edit in the sidebar
   * shows its effect rather than silently redrawing.
   */
  track?: number | null
  describeChange?: (from: number | null, to: number | null) => StatDelta | null
  /** Opens whatever explains this figure. */
  onClick?: () => void
  linkTitle?: string
}

/**
 * One of the three or four numbers the whole plan comes down to. Deliberately
 * several steps louder than `SummaryCard`, which carries everything else.
 */
export function HeroStat({
  label,
  value,
  unit,
  sub,
  tone = 'default',
  compare,
  track,
  describeChange,
  onClick,
  linkTitle,
}: HeroStatProps) {
  const previous = useRecentChange(track ?? null)
  const change =
    describeChange && previous !== undefined ? describeChange(previous, track ?? null) : null

  const figure = (
    <>
      <span className="truncate">{value}</span>
      {unit && (
        <span className="shrink-0 font-sans text-sm font-normal text-slate-400 dark:text-slate-500">
          {unit}
        </span>
      )}
    </>
  )
  const figureClasses = `font-display mt-2 flex items-baseline gap-1.5 text-4xl leading-none font-semibold sm:text-[2.75rem] ${toneClasses[tone]}`

  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">
          {label}
        </span>
        {change && change.direction !== 'same' && <DeltaPill delta={change} />}
      </p>

      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          title={linkTitle}
          className={`${figureClasses} max-w-full cursor-pointer rounded underline-offset-[6px] hover:underline focus-visible:ring-2 focus-visible:ring-ink-500 focus-visible:outline-none`}
        >
          {figure}
        </button>
      ) : (
        <p className={figureClasses}>{figure}</p>
      )}

      {compare && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">{compare.name}</span>
          <span className="font-display font-semibold text-slate-700 dark:text-slate-200">
            {compare.value}
          </span>
          {compare.delta && <DeltaPill delta={compare.delta} />}
        </p>
      )}

      {sub && (
        <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{sub}</p>
      )}
    </div>
  )
}
