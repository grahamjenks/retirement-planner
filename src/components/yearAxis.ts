import type { YearRow } from '../lib/types'

/** Each year's ages, looked up by the tick below. Memoise it per chart. */
export function agesByYearFrom(rows: YearRow[]): Map<number, number[]> {
  const agesByYear = new Map<number, number[]>()
  rows.forEach((r) => agesByYear.set(r.year, r.people.map((p) => p.age)))
  return agesByYear
}

/** "Year · ages (Me · Partner)" — names the numbers under each tick. */
export function yearAxisLabel(rows: YearRow[]): string {
  const names = rows[0]?.people.map((p) => p.name) ?? []
  return names.length > 0 ? `Year · ages (${names.join(' · ')})` : 'Year'
}
