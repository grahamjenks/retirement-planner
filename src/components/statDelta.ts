import { formatCurrency } from '../lib/format'

export type DeltaDirection = 'better' | 'worse' | 'same'

/** How a figure moved, and whether that movement is good news. */
export interface StatDelta {
  text: string
  direction: DeltaDirection
}

export const deltaClasses: Record<DeltaDirection, string> = {
  better: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  worse: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  same: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

function direction(change: number, betterWhen: 'lower' | 'higher'): DeltaDirection {
  if (change === 0) return 'same'
  const good = betterWhen === 'lower' ? change < 0 : change > 0
  return good ? 'better' : 'worse'
}

/** A true minus sign, matching the money formatter rather than a hyphen. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`
}

/**
 * An age or a count of years. Retiring earlier is better; pots lasting longer
 * is better — hence the explicit direction rather than a guess from the sign.
 */
export function yearsDelta(
  from: number | null,
  to: number | null,
  betterWhen: 'lower' | 'higher',
  noun = 'years',
): StatDelta | null {
  if (from === null || to === null) return null
  const change = to - from
  if (change === 0) return { text: 'same', direction: 'same' }
  return {
    text: `${signed(change)} ${Math.abs(change) === 1 ? noun.replace(/s$/, '') : noun}`,
    direction: direction(change, betterWhen),
  }
}

export function moneyDelta(
  from: number,
  to: number,
  betterWhen: 'lower' | 'higher',
): StatDelta | null {
  const change = Math.round(to - from)
  if (change === 0) return { text: 'same', direction: 'same' }
  return {
    text: `${change > 0 ? '+' : '−'}${formatCurrency(Math.abs(change))}`,
    direction: direction(change, betterWhen),
  }
}

/**
 * The age the pots empty, where "never" is not a number but is the best
 * possible answer — so it can't go through `yearsDelta`.
 */
export function runsDryDelta(from: number | null, to: number | null): StatDelta | null {
  if (from === null && to === null) return { text: 'same', direction: 'same' }
  if (from === null) return { text: 'now runs dry', direction: 'worse' }
  if (to === null) return { text: 'now lasts', direction: 'better' }
  return yearsDelta(from, to, 'higher')
}
