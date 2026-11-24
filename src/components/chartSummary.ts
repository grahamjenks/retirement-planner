import { formatCurrency } from '../lib/format'

/**
 * Keeps a readable sample of a long series: both ends, plus roughly every
 * `every`th point between them.
 *
 * A fifty-year projection read out row by row is not a summary, it is a
 * recital. The milestones a reader actually needs — retirement, the state
 * pension — are already called out in the year tables, so this only has to
 * give the shape.
 */
export function condense<T>(rows: T[], every = 5): T[] {
  if (rows.length <= 2) return rows
  const kept = rows.filter((_r, i) => i % every === 0)
  const last = rows[rows.length - 1]
  if (kept[kept.length - 1] !== last) kept.push(last)
  return kept
}

interface Point {
  label: string
  value: number
}

/**
 * Where a money series starts, where it tops out and where it finishes — the
 * three things someone looking at the line would say about it.
 */
export function describeMoneySeries(points: Point[], noun: string): string {
  if (points.length === 0) return `No ${noun} to show.`
  const first = points[0]
  const last = points[points.length - 1]
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0])
  const parts = [`${noun} starts at ${formatCurrency(first.value)} in ${first.label}`]
  // A peak at either end is just the start or the end again.
  if (peak !== first && peak !== last) {
    parts.push(`peaks at ${formatCurrency(peak.value)} in ${peak.label}`)
  }
  parts.push(`and ends at ${formatCurrency(last.value)} in ${last.label}`)
  return `${parts.join(', ')}.`
}
