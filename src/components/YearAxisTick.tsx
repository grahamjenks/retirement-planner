
interface TickProps {
  x?: number
  y?: number
  payload?: { value?: number | string }
}


/**
 * X-axis tick showing the calendar year with everyone's age beneath it, so a
 * point on the chart can be read as "2041 — she's 55, he's 57" without
 * counting along from today.
 *
 * Declared once rather than built per render: a component made inside render
 * is a new type every time, and React throws away and rebuilds every tick in
 * the axis rather than updating the ones already there. Recharts clones this
 * element to add x, y and payload, so the ages ride along as a plain prop.
 */
export function YearAgeTick({
  agesByYear,
  x = 0,
  y = 0,
  payload,
}: TickProps & { agesByYear: Map<number, number[]> }) {
  const year = Number(payload?.value)
  const ages = agesByYear.get(year)
  return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11} className="fill-slate-500">
          {year}
        </text>
        {ages && ages.length > 0 && (
          <text x={0} y={0} dy={24} textAnchor="middle" fontSize={10} className="fill-slate-400">
            {ages.join('·')}
          </text>
        )}
    </g>
  )
}
