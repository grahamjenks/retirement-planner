import { memo, useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { planHeadroom, sensitivity } from '../lib/analysis'
import { formatCurrency, formatCurrencyCompact } from '../lib/format'
import type { Assumptions } from '../lib/types'
import { ALERT_COLOR } from './chartColors'
import { ChartFigure } from './ChartFigure'

interface SensitivityChartProps {
  assumptions: Assumptions
}

/**
 * A tornado: each assumption pushed to both ends of a plausible range, ranked
 * by how far the outcome moves. The point is to show which assumptions the plan
 * actually hangs on, rather than implying the central case is precise.
 */
function SensitivityChartBase({ assumptions: a }: SensitivityChartProps) {
  const base = useMemo(() => planHeadroom(a), [a])
  const factors = useMemo(() => sensitivity(a), [a])

  const data = factors.map((f) => ({
    label: f.label,
    low: f.lowHeadroom - base.headroom,
    high: f.highHeadroom - base.headroom,
    lowLabel: f.lowLabel,
    highLabel: f.highLabel,
  }))

  return (
    <ChartFigure
      title="What moves the plan most"
      summary={
        factors.length > 0
          ? `Ranked by how far the outcome moves between the two ends of each assumption. ${factors[0].label} matters most: ${factors[0].lowLabel} and ${factors[0].highLabel} put the plan ${formatCurrency(Math.abs(factors[0].highHeadroom - factors[0].lowHeadroom))} apart.`
          : 'Nothing to compare.'
      }
      rows={factors}
      columns={[
        { label: 'Assumption', value: (f) => f.label },
        { label: 'Low end', value: (f) => f.lowLabel },
        { label: 'Plan at the low end', value: (f) => formatCurrency(f.lowHeadroom) },
        { label: 'High end', value: (f) => f.highLabel },
        { label: 'Plan at the high end', value: (f) => formatCurrency(f.highHeadroom) },
        { label: 'Swing', value: (f) => formatCurrency(Math.abs(f.swing)) },
      ]}
    >
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Each assumption moved to either end of a plausible range, one at a time, with everything
        else held still. Bars show how much better or worse the plan ends up than your central case
        of <strong>{base.totalShortfall > 0.01 ? `a ${formatCurrency(base.totalShortfall)} shortfall` : `${formatCurrency(base.finalPot)} left`}</strong>.
        The longest bars are what your plan actually depends on.
      </p>

      <div className="w-full" style={{ height: Math.max(200, data.length * 44 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCurrencyCompact(v)}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value, name, item) => {
                const d = item?.payload as (typeof data)[number] | undefined
                const end = name === 'low' ? d?.lowLabel : d?.highLabel
                const v = Number(value)
                return [
                  `${v >= 0 ? '+' : ''}${formatCurrency(v)} vs your plan`,
                  `${end ?? name}`,
                ]
              }}
            />
            <ReferenceLine x={0} stroke="#64748b" strokeWidth={2} />
            <Bar dataKey="low" name="low" barSize={14}>
              {data.map((d) => (
                <Cell key={`l-${d.label}`} fill={d.low < 0 ? ALERT_COLOR : '#0d9488'} />
              ))}
            </Bar>
            <Bar dataKey="high" name="high" barSize={14}>
              {data.map((d) => (
                <Cell key={`h-${d.label}`} fill={d.high < 0 ? ALERT_COLOR : '#0d9488'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Red is worse than your plan, green better. One assumption changes at a time — a bad year
        rarely arrives alone, so treat these as the sensitivity of each lever, not a worst case.
      </p>
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
export const SensitivityChart = memo(SensitivityChartBase)
