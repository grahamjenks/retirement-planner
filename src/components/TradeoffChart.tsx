import { memo, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { retirementTradeoff } from '../lib/analysis'
import { formatCurrency, formatCurrencyCompact } from '../lib/format'
import type { Assumptions } from '../lib/types'
import { ALERT_COLOR, PENSION_COLORS } from './chartColors'
import { CompareNote } from './CompareNote'
import { ghostLine } from './chartCompare'

interface TradeoffChartProps {
  assumptions: Assumptions
  /**
   * This chart re-runs the plan itself rather than reading prepared rows, so
   * the comparison arrives as assumptions and gets its own sweep.
   */
  compare?: { name: string; assumptions: Assumptions } | null
}

/**
 * The price of each extra year worked. "Earliest sustainable age" is a single
 * number; this is the curve behind it, so you can see whether retiring a year
 * earlier costs a little or a lot.
 */
function TradeoffChartBase({ assumptions: a, compare }: TradeoffChartProps) {
  const [personId, setPersonId] = useState(a.people[0]?.id ?? '')
  const person = a.people.find((p) => p.id === personId) ?? a.people[0]
  const points = useMemo(
    () => (person ? retirementTradeoff(a, person.id) : []),
    [a, person],
  )
  // Matched by id, which a duplicated plan keeps, then by name for a plan
  // that came from somewhere else.
  const comparePerson = compare
    ? (compare.assumptions.people.find((p) => p.id === personId) ??
      compare.assumptions.people.find((p) => p.name === person?.name))
    : undefined
  const comparePoints = useMemo(
    () =>
      compare && comparePerson ? retirementTradeoff(compare.assumptions, comparePerson.id) : [],
    [compare, comparePerson],
  )

  if (!person || points.length === 0) return null

  const compareByAge = new Map(comparePoints.map((p) => [p.retirementAge, p]))

  const firstSustainable = points.find((p) => p.sustainable)
  const data = points.map((p) => {
    const other = compareByAge.get(p.retirementAge)
    return {
      age: p.retirementAge,
      // A plan that never runs dry is plotted at life expectancy, the top of
      // the chart, so "lasts for life" reads as success rather than a missing
      // point.
      runsDry: p.runsDryAge ?? person.lifeExpectancy,
      left: p.finalPot,
      sustainable: p.sustainable,
      c_runsDry: other ? (other.runsDryAge ?? comparePerson?.lifeExpectancy) : undefined,
      c_left: other?.finalPot,
    }
  })

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Cost of retiring earlier</h2>
        {a.people.length > 1 && (
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {a.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Each point re-runs the whole plan with {person.name} retiring at that age, everyone else
        unchanged. The line shows the age the pots run dry; reaching{' '}
        {person.lifeExpectancy} means they last for life.
        {firstSustainable && (
          <>
            {' '}
            Earliest that works: <strong>{firstSustainable.retirementAge}</strong>.
          </>
        )}
      </p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 12 }}
              height={42}
              label={{
                value: `${person.name} retires at…`,
                position: 'insideBottom',
                offset: 2,
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="age"
              tick={{ fontSize: 12 }}
              width={46}
              domain={['dataMin - 2', person.lifeExpectancy]}
              label={{ value: 'Pots last to', angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            <YAxis
              yAxisId="money"
              orientation="right"
              tickFormatter={(v) => formatCurrencyCompact(v)}
              tick={{ fontSize: 12 }}
              width={64}
            />
            <Tooltip
              formatter={(value, name) =>
                name === 'Pots last to age'
                  ? [`age ${Math.round(Number(value))}`, name]
                  : [formatCurrency(Number(value)), name]
              }
              labelFormatter={(age) => `Retire at ${age}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              yAxisId="age"
              y={person.lifeExpectancy}
              stroke="#64748b"
              strokeDasharray="4 4"
              label={{
                value: `lasts for life (${person.lifeExpectancy})`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#64748b',
              }}
            />
            {firstSustainable && (
              <ReferenceLine
                yAxisId="age"
                x={firstSustainable.retirementAge}
                stroke="#0d9488"
                strokeWidth={2}
                label={{
                  value: `earliest ${firstSustainable.retirementAge}`,
                  position: 'top',
                  fontSize: 11,
                  fill: '#0d9488',
                }}
              />
            )}
            <ReferenceLine
              yAxisId="age"
              x={person.retirementAge}
              stroke={PENSION_COLORS[0]}
              strokeDasharray="4 4"
              label={{
                value: 'your plan',
                position: 'top',
                fontSize: 11,
                fill: PENSION_COLORS[0],
              }}
            />
            {/*
              This chart sweeps *over* retirement age, so two plans that differ
              only in when someone stops work draw the same curve — what moves
              is the marker. That makes the compared plan's own age the useful
              overlay here, alongside the curves for everything else.
            */}
            {compare && comparePerson && comparePerson.retirementAge !== person.retirementAge && (
              <ReferenceLine
                yAxisId="age"
                x={comparePerson.retirementAge}
                stroke={PENSION_COLORS[0]}
                strokeOpacity={0.55}
                strokeDasharray="1 3"
                label={{
                  value: compare.name,
                  position: 'top',
                  fontSize: 11,
                  fill: PENSION_COLORS[0],
                  opacity: 0.8,
                }}
              />
            )}

            <Line
              yAxisId="age"
              type="monotone"
              dataKey="runsDry"
              name="Pots last to age"
              stroke={ALERT_COLOR}
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="money"
              type="monotone"
              dataKey="left"
              name="Left at end of plan"
              stroke="#0d9488"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
            />

            {/*
              Dotted rather than dashed here: "Left at end of plan" is already
              a dashed series, so the usual overlay dash would say two things.
            */}
            {compare && (
              <Line
                {...ghostLine}
                yAxisId="age"
                dataKey="c_runsDry"
                strokeDasharray="1 3"
                stroke={ALERT_COLOR}
              />
            )}
            {compare && (
              <Line
                {...ghostLine}
                yAxisId="money"
                dataKey="c_left"
                strokeDasharray="1 3"
                stroke="#0d9488"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {compare && comparePerson && (
        <CompareNote name={compare.name} of="its own retirement age, and the same two curves" dash="1 3" />
      )}
    </div>
  )
}

/**
 * Memoised: the page re-renders for things these charts do not care about —
 * a toggle elsewhere, a panel opening — and redrawing every series for that
 * is the bulk of the work. Props are the deferred assumptions and the rows
 * built from them, both stable between unrelated renders.
 */
export const TradeoffChart = memo(TradeoffChartBase)
