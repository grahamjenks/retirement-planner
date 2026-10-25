import { memo, useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatCurrencyCompact } from '../lib/format'
import type { Assumptions, YearRow } from '../lib/types'
import { PENSION_COLORS } from './chartColors'
import { CompareNote } from './CompareNote'
import { ghostLine, rowsByYear, type ChartCompare } from './chartCompare'
import { YearAgeTick } from './YearAxisTick'
import { agesByYearFrom, yearAxisLabel } from './yearAxis'

interface TaxHeadroomChartProps {
  assumptions: Assumptions
  rows: YearRow[]
  compare?: ChartCompare | null
}

/**
 * Each person's taxable income against the tax bands, year by year. The gap to
 * the 40% threshold is the actionable number: it says how much more could be
 * drawn in a given year before the marginal rate doubles.
 */
function TaxHeadroomChartBase({ assumptions: a, rows, compare }: TaxHeadroomChartProps) {
  const tickAges = useMemo(() => agesByYearFrom(rows), [rows])
  const t = a.tax
  // Bands are drawn at the untapered allowance; the taper only bites well above
  // the higher-rate line and would make the guides move about confusingly.
  const pa = t.personalAllowance
  const higherStart = pa + t.basicBandWidth
  const additionalStart = pa + t.basicBandWidth + t.higherBandWidth

  const compareByYear = rowsByYear(compare)
  const taxableOf = (py: { statePension: number; dbIncome: number; taxablePensionWithdrawal: number }) =>
    py.statePension + py.dbIncome + py.taxablePensionWithdrawal

  const data = rows.map((r) => {
    const point: Record<string, number> = { year: r.year }
    r.people.forEach((py) => {
      point[`taxable_${py.id}`] = taxableOf(py)
    })
    // These are plain lines, so each person's comparison can shadow their own
    // directly rather than going through a total.
    compareByYear.get(r.year)?.people.forEach((py) => {
      point[`c_taxable_${py.id}`] = taxableOf(py)
    })
    return point
  })

  const peak = Math.max(
    ...data.flatMap((d) =>
      Object.entries(d)
        .filter(([k]) => k.startsWith('taxable_'))
        .map(([, v]) => v as number),
    ),
    higherStart * 1.15,
  )

  return (
    <div className="w-full">
      <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 18 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />

          {/* Bands as background, so a line crossing one is obvious. */}
          <ReferenceArea y1={0} y2={pa} fill="#65a30d" fillOpacity={0.1} />
          <ReferenceArea y1={pa} y2={higherStart} fill="#f59e0b" fillOpacity={0.1} />
          <ReferenceArea y1={higherStart} y2={additionalStart} fill="#e11d48" fillOpacity={0.1} />

          <XAxis
            dataKey="year"
            tick={<YearAgeTick agesByYear={tickAges} />}
            height={58}
            interval="preserveStartEnd"
            minTickGap={24}
            label={{
              value: yearAxisLabel(rows),
              position: 'insideBottom',
              offset: 2,
              fontSize: 11,
            }}
          />
          <YAxis
            tickFormatter={(v) => formatCurrencyCompact(v)}
            tick={{ fontSize: 12 }}
            width={64}
            domain={[0, Math.ceil(peak / 10000) * 10000]}
          />
          <Tooltip
            formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
            labelFormatter={(year) => {
              const row = rows.find((r) => r.year === Number(year))
              return row
                ? `${year} — ${row.people.map((p) => `${p.name} ${p.age}`).join(', ')}`
                : `${year}`
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          <ReferenceLine
            y={pa}
            stroke="#65a30d"
            strokeDasharray="4 4"
            label={{
              value: `allowance ${formatCurrencyCompact(pa)} — 0%`,
              position: 'insideTopLeft',
              fontSize: 10,
              fill: '#65a30d',
            }}
          />
          <ReferenceLine
            y={higherStart}
            stroke="#e11d48"
            strokeWidth={2}
            label={{
              value: `${t.higherRatePct}% starts ${formatCurrencyCompact(higherStart)}`,
              position: 'insideTopLeft',
              fontSize: 10,
              fill: '#e11d48',
            }}
          />

          {a.people.map((person, i) => (
            <Line
              key={person.id}
              type="monotone"
              dataKey={`taxable_${person.id}`}
              name={`${person.name}: taxable income`}
              stroke={PENSION_COLORS[i % PENSION_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}

          {compare &&
            a.people.map((person, i) => (
              <Line
                {...ghostLine}
                key={`compare-${person.id}`}
                dataKey={`c_taxable_${person.id}`}
                stroke={PENSION_COLORS[i % PENSION_COLORS.length]}
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      {compare && <CompareNote name={compare.name} of="the same people's taxable income" />}
    </div>
  )
}

/**
 * Memoised: the page re-renders for things these charts do not care about —
 * a toggle elsewhere, a panel opening — and redrawing every series for that
 * is the bulk of the work. Props are the deferred assumptions and the rows
 * built from them, both stable between unrelated renders.
 */
export const TaxHeadroomChart = memo(TaxHeadroomChartBase)
