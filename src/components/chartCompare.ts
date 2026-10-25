import type { YearRow } from '../lib/types'

/** A second plan drawn over the first, named under the chart. */
export interface ChartCompare {
  name: string
  rows: YearRow[]
}

/**
 * The compared plan can run to a different age, so its rows are looked up by
 * year rather than zipped by index.
 */
export function rowsByYear(compare: ChartCompare | null | undefined): Map<number, YearRow> {
  return new Map(compare?.rows.map((r) => [r.year, r]) ?? [])
}

/**
 * Neutral ink for an overlay with no series of its own to borrow a colour
 * from — the total of a stack, which is an edge rather than a band. Every hue
 * in `chartColors` already means something, so the comparison takes none.
 */
export const COMPARE_INK = '#475569'

/**
 * Shared look for an overlaid series: the same hue as what it shadows, dashed
 * and faded, and out of both the legend and the tooltip. `CompareNote` names
 * it instead — see that component for why it stays out of the legend.
 */
export const ghostLine = {
  type: 'monotone',
  strokeWidth: 2,
  strokeDasharray: '5 3',
  strokeOpacity: 0.55,
  dot: false,
  isAnimationActive: false,
  legendType: 'none',
  tooltipType: 'none',
  connectNulls: true,
} as const
