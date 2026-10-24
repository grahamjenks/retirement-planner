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
  return names.length > 0 ? `Year · ages (${names.join(' · ')})` : 'Year'
}
