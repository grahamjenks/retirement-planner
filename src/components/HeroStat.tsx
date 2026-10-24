import type { ReactNode } from 'react'

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

interface HeroStatProps {
  label: string
  value: ReactNode
  /** Small trailing word on the same baseline — "a year", "+", and so on. */
  unit?: string
  sub?: ReactNode
  tone?: Tone
}

/**
 * One of the three or four numbers the whole plan comes down to. Deliberately
 * several steps louder than `SummaryCard`, which carries everything else.
 */
export function HeroStat({ label, value, unit, sub, tone = 'default' }: HeroStatProps) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">
        {label}
      </p>
      <p
        className={`font-display mt-2 flex items-baseline gap-1.5 text-4xl leading-none font-semibold sm:text-[2.75rem] ${toneClasses[tone]}`}
      >
        <span className="truncate">{value}</span>
        {unit && (
          <span className="shrink-0 font-sans text-sm font-normal text-slate-400 dark:text-slate-500">
            {unit}
          </span>
        )}
      </p>
      {sub && (
        <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{sub}</p>
      )}
    </div>
  )
}
