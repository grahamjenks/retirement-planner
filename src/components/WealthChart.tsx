import { memo, useMemo } from 'react'
import {
  Area,
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
import { formatCurrency, formatCurrencyCompact, ownedLabel, personAge } from '../lib/format'
import type { Assumptions, YearRow } from '../lib/types'
import { ALERT_COLOR, PENSION_COLORS, POT_COLORS, PROPERTY_COLOR } from './chartColors'
import { CompareNote } from './CompareNote'
import { COMPARE_INK, ghostLine, rowsByYear, type ChartCompare } from './chartCompare'
import { WealthTooltip } from './WealthTooltip'
import { LABEL_ROW_HEIGHT, labelRows } from './referenceLabels'
import { YearAgeTick } from './YearAxisTick'
import { agesByYearFrom, yearAxisLabel } from './yearAxis'
import { ChartFigure } from './ChartFigure'
import { condense, describeMoneySeries } from './chartSummary'

/**
 * `property` is `stacked` plus the house.
 *
 * It is a separate view rather than always-on because property equity is
 * usually the largest number in the plan: stacked in by default it dwarfs the
 * drawable bands and doubles the y-axis, which costs exactly the resolution
 * you need to see a pot running dry. Opt in to see total wealth; stay out to
 * see what the plan can spend.
 */
export type WealthChartMode = 'stacked' | 'lines' | 'property'

interface WealthChartProps {
  assumptions: Assumptions
  rows: YearRow[]
  shortfallYear: number | null
  drawdownYear: number | null
  unlocks: { t: number; label: string }[]
  mode: WealthChartMode
  compare?: ChartCompare | null
}

function baseYearOf(rows: { year: number }[]): number {
  return rows.length > 0 ? rows[0].year : 0
}

function WealthChartBase({
  assumptions: a,
  rows,
  shortfallYear,
  drawdownYear,
  unlocks,
  mode,
  compare,
}: WealthChartProps) {
  const lastYear = rows.length > 0 ? rows[rows.length - 1].year : 0
  const baseYear = rows.length > 0 ? rows[0].year : 0
  // Stack labels that would otherwise print through each other.
  const retireRows = labelRows(a.people.map((p) => p.retirementAge - p.currentAge))
  const unlockRows = labelRows(unlocks.map((u) => u.t))
  const dcPeople = a.people.filter((p) => p.pensionType === 'dc')
  const tickAges = useMemo(() => agesByYearFrom(rows), [rows])
  // A drawdown marker sitting on a retirement year would print on top of it.
  const retirementYears = new Set(
    a.people.map((p) => baseYearOf(rows) + (p.retirementAge - p.currentAge)),
  )

  /*
   * Property rides at the top of the stack, in its own hue, because it is the
   * one band here that cannot be spent — only sold. Keeping it last means the
   * drawable bands below it still reach zero where they always did, so the
   * year the money runs out is as visible as before.
   */
  const showProperty = mode === 'property' && a.properties.length > 0

  const compareByYear = rowsByYear(compare)

  const data = rows.map((r) => {
    const point: Record<string, number> = { year: r.year }
    dcPeople.forEach((person) => {
      const py = r.people.find((x) => x.id === person.id)
      point[`pension_${person.id}`] = py ? py.pensionPot : 0
    })
    a.pots.forEach((_pot, i) => {
      point[`pot_${i}`] = r.potBalances[i] ?? 0
    })
    if (showProperty) point.property = r.propertyEquityTotal
    const other = compareByYear.get(r.year)
    if (other) {
      let total = 0
      dcPeople.forEach((person) => {
        const py = other.people.find((x) => x.id === person.id)
        if (py) {
          point[`c_pension_${person.id}`] = py.pensionPot
          total += py.pensionPot
        }
      })
      a.pots.forEach((_pot, i) => {
        const balance = other.potBalances[i]
        if (balance !== undefined) {
          point[`c_pot_${i}`] = balance
          total += balance
        }
      })
      if (showProperty) {
        point.c_property = other.propertyEquityTotal
        total += other.propertyEquityTotal
      }
      point.c_total = total
    }
    return point
  })

  const series = [
    ...dcPeople.map((person, i) => ({
      key: `pension_${person.id}`,
      name: ownedLabel('pension', person.name, a.people.length),
      color: PENSION_COLORS[i % PENSION_COLORS.length],
    })),
    ...a.pots.map((pot, i) => ({
      key: `pot_${i}`,
      name: pot.name,
      color: POT_COLORS[i % POT_COLORS.length],
    })),
    ...(showProperty
      ? [{ key: 'property', name: 'Property equity', color: PROPERTY_COLOR }]
      : []),
  ]

  const tabulated = condense(rows)
  return (
    <ChartFigure
      title={`Wealth over time${showProperty ? ', including property equity' : ''}`}
      summary={describeMoneySeries(
        rows.map((r) => ({
          label: String(r.year),
          value: showProperty ? r.netWorth : r.totalPot,
        })),
        showProperty ? 'Net worth' : 'Total pots and pensions',
      )}
      rows={tabulated}
      columns={[
        { label: 'Year', value: (r) => String(r.year) },
        {
          label: a.people.length > 1 ? 'Ages' : 'Age',
          value: (r) => r.people.map((x) => personAge(x.name, x.age, a.people.length)).join(', '),
        },
        { label: 'Savings pots', value: (r) => formatCurrency(r.potsTotal) },
        { label: 'Pensions', value: (r) => formatCurrency(r.pensionsTotal) },
        ...(showProperty
          ? [{ label: 'Property equity', value: (r: YearRow) => formatCurrency(r.propertyEquityTotal) }]
          : []),
        {
          label: showProperty ? 'Net worth' : 'Total',
          value: (r) => formatCurrency(showProperty ? r.netWorth : r.totalPot),
        },
      ]}
    >
    <div className="w-full">
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 34, right: 16, left: 0, bottom: 18 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            {drawdownYear !== null && (
              <ReferenceArea
                x1={drawdownYear}
                x2={lastYear}
                fill={ALERT_COLOR}
                fillOpacity={0.06}
                label={{
                  value: 'Drawdown phase',
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: ALERT_COLOR,
                }}
              />
            )}
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
            />
            <Tooltip content={<WealthTooltip assumptions={a} rows={rows} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            {mode !== 'lines'
              ? series.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stackId="1"
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.55}
                  />
                ))
              : series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}

            {/*
              Stacked, each band sits at its cumulative height, so a ghost of
              one band at its own value would line up with nothing. The honest
              overlay there is the total — the top edge of the stack. Compared
              pot by pot, each series can shadow its own line directly.
            */}
            {compare &&
              (mode === 'lines' ? (
                series.map((s) => (
                  <Line
                    {...ghostLine}
                    key={`compare-${s.key}`}
                    dataKey={`c_${s.key}`}
                    stroke={s.color}
                  />
                ))
              ) : (
                <Line {...ghostLine} dataKey="c_total" stroke={COMPARE_INK} />
              ))}

            {unlocks.map((u, ui) => (
              <ReferenceLine
                key={`${u.label}-${u.t}`}
                x={baseYear + u.t}
                stroke="#94a3b8"
                strokeDasharray="2 4"
                label={{
                  value: `🔓 ${u.label}`,
                  position: 'insideBottomLeft',
                  dy: -unlockRows[ui] * LABEL_ROW_HEIGHT,
                  fontSize: 10,
                  fill: '#94a3b8',
                }}
              />
            ))}
            {a.people.map((person, i) => (
              <ReferenceLine
                key={`retire-${person.id}`}
                x={baseYear + (person.retirementAge - person.currentAge)}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{
                  value: a.people.length > 1 ? `${person.name} retires` : 'Retirement',
                  position: 'top',
                  dy: retireRows[i] * LABEL_ROW_HEIGHT,
                  fontSize: 11,
                  fill: '#64748b',
                }}
              />
            ))}
            {drawdownYear !== null && (
              <ReferenceLine
                x={drawdownYear}
                stroke={ALERT_COLOR}
                strokeWidth={2}
                label={
                  retirementYears.has(drawdownYear)
                    ? undefined
                    : {
                        value: 'Drawdown starts',
                        position: 'top',
                        fontSize: 11,
                        fill: ALERT_COLOR,
                      }
                }
              />
            )}
            {shortfallYear && (
              <ReferenceLine
                x={shortfallYear}
                stroke={ALERT_COLOR}
                strokeDasharray="4 4"
                label={{ value: 'Shortfall', position: 'top', fontSize: 12, fill: ALERT_COLOR }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {compare && (
        <CompareNote
          name={compare.name}
          of={
            mode === 'lines'
              ? 'the same pots and pensions'
              : 'its total, against the top of the stack'
          }
        />
      )}
    </div>
    </ChartFigure>
  )
}

/**
 * Memoised: the page re-renders for things these charts do not care about —
 * a toggle elsewhere, a panel opening — and redrawing every series for that
 * is the bulk of the work. Props are the deferred assumptions and the rows
 * built from them, both stable between unrelated renders.
 */
export const WealthChart = memo(WealthChartBase)
