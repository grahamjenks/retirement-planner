/**
 * Names the ghosted series under a chart.
 *
 * The scenario overlay deliberately stays out of the recharts legend: it is
 * drawn with the same role colours as the plan it is compared against, so a
 * legend entry would either have to pick one of those hues and imply it meant
 * something, or repeat every series twice. A dashed swatch and a name say the
 * whole thing in one line.
 */
export function CompareNote({
  name,
  of = 'the same figures',
  dash = '5 3',
}: {
  name: string
  of?: string
  /** Match the chart, where a plain dash is already taken by a real series. */
  dash?: string
}) {
  return (
    <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true" className="shrink-0">
        <line
          x1="0"
          y1="4"
          x2="22"
          y2="4"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={dash}
          strokeOpacity="0.55"
        />
      </svg>
      <span>
        {/* Follow the swatch: charts that already own the dash get dots. */}
        {dash.startsWith('1 ') ? 'Dotted' : 'Dashed'}:{' '}
        <strong className="font-semibold text-slate-600 dark:text-slate-300">{name}</strong> — {of}.
      </span>
    </p>
  )
}
