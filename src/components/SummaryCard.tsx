import type { ReactNode } from 'react'

type Tone = 'default' | 'good' | 'bad' | 'warn'

/*
 * Status is the one job chrome is allowed to spend a hue on, and `chartColors`
 * sets the rule: red means a problem. A figure that is fine gets no colour at
 * all — colouring every healthy number green makes green mean nothing, and
 * leaves the figures that *are* a problem with nowhere louder to go.
 */
const toneClasses: Record<Tone, string> = {
  default: 'text-slate-800 dark:text-slate-100',
  good: 'text-slate-800 dark:text-slate-100',
  bad: 'text-rose-700 dark:text-rose-400',
  warn: 'text-amber-700 dark:text-amber-400',
}

interface SummaryCardProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
}

/**
 * Supporting figures. Quiet on purpose — flat, borderless, a third the size of
 * a `HeroStat` — so the handful of numbers that decide the plan stay the
 * loudest thing on the page.
 */
export function SummaryCard({ label, value, sub, tone = 'default' }: SummaryCardProps) {
  return (
    <div className="min-w-0 px-4 py-1">
      <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </p>
      <p className={`font-display mt-1 truncate text-xl font-semibold ${toneClasses[tone]}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-slate-500">{sub}</p>
      )}
    </div>
  )
}
