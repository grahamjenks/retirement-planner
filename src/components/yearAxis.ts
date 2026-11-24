import type { YearRow } from '../lib/types'

/** Each year's ages, looked up by the tick below. Memoise it per chart. */
export function agesByYearFrom(rows: YearRow[]): Map<number, number[]> {
  const agesByYear = new Map<number, number[]>()
  rows.forEach((r) => agesByYear.set(r.year, r.people.map((p) => p.age)))
  return agesByYear
}

/**
 * "Year · ages (Me · Partner)" — names the numbers under each tick.
 *
 * Charts render this with `position: 'insideBottom'` and a *positive* offset,
 * inside an XAxis tall enough to hold the two tick lines and the label. A
 * negative offset pushes it below the axis band, where a legend that has
 * wrapped onto extra rows prints straight through it — which is what used to
 * happen at narrow widths.
 */
export function yearAxisLabel(rows: YearRow[]): string {
  const names = rows[0]?.people.map((p) => p.name) ?? []
  if (names.length === 0) return 'Year'
  // With one person there is nobody to tell the number apart from, and the
  // name a plan starts with is "Me" — so "Year · ages (Me)" labels the axis
  // after someone who never typed a name.
  if (names.length === 1) return 'Year · age'
  return `Year · ages (${names.join(' · ')})`
}
