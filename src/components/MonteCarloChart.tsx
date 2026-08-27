import { useMemo, useState } from 'react'
import {
  Area,
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
import { formatCurrency, formatCurrencyCompact } from '../lib/format'
import { runMonteCarlo } from '../lib/montecarlo'
import { simulate } from '../lib/projection'
import type { Assumptions } from '../lib/types'
import { ALERT_COLOR } from './chartColors'
import { makeYearAgeTick, yearAxisLabel } from './YearAxisTick'

interface MonteCarloChartProps {
  assumptions: Assumptions
}

const TRIAL_CHOICES = [200, 500, 1000] as const

/**
 * The plan re-run many times with the good and bad years shuffled.
 *
 * The rest of the app assumes the same return every year, which quietly hides
 * sequence risk: a crash early in drawdown does far more damage than the same
 * crash at 85, because units are being sold to live on. The spread here is what
 * a single confident line cannot show.
 */
export function MonteCarloChart({ assumptions: a }: MonteCarloChartProps) {
  const [volatility, setVolatility] = useState(15)
  const [trials, setTrials] = useState<number>(500)
  const [seed, setSeed] = useState(42)

  const result = useMemo(
    () => runMonteCarlo(a, { trials, volatilityPct: volatility, seed }),
    [a, trials, volatility, seed],
  )
  const baseline = useMemo(() => simulate(a), [a])

  const data = result.bands.map((b, i) => ({
    year: b.year,
    outer: [b.p10, b.p90] as [number, number],
    inner: [b.p25, b.p75] as [number, number],
    median: b.p50,
    planned: baseline[i]?.totalPot ?? 0,
  }))

  const success = result.successRate * 100
  const tone =
    success >= 85
      ? 'text-emerald-600 dark:text-emerald-400'
      : success >= 70
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400'

  const YearTick = makeYearAgeTick(baseline)
  const medianDryAge =
    result.runsDryAges.length > 0
      ? result.runsDryAges[Math.floor(result.runsDryAges.length / 2)]
      : null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">If returns don't arrive smoothly</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            Volatility
            <input
              type="range"
              min={0}
              max={25}
              step={1}
              value={volatility}
              onChange={(e) => setVolatility(e.target.valueAsNumber)}
              className="w-24"
            />
            <span className="w-8 font-semibold text-blue-600 tabular-nums dark:text-blue-400">
              {volatility}%
            </span>
          </label>
          <select
            value={trials}
            onChange={(e) => setTrials(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {TRIAL_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n} runs
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            title="Draw a different set of random years"
          >
            Reshuffle
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm">
          <span className={`text-2xl font-bold ${tone}`}>{success.toFixed(0)}%</span>{' '}
          <span className="text-slate-600 dark:text-slate-300">of runs funded every year</span>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Median left at the end <strong>{formatCurrency(result.medianEnd)}</strong> · unlucky tenth{' '}
          <strong>{formatCurrency(result.p10End)}</strong> · lucky tenth{' '}
          <strong>{formatCurrency(result.p90End)}</strong>
          {medianDryAge !== null && (
            <> · when it fails, pots typically run dry around age {medianDryAge}</>
          )}
        </p>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 18 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis
              dataKey="year"
              tick={<YearTick />}
              height={42}
              interval="preserveStartEnd"
              minTickGap={24}
              label={{
                value: yearAxisLabel(baseline),
                position: 'insideBottom',
                offset: -14,
                fontSize: 11,
              }}
            />
            <YAxis
              tickFormatter={(v) => formatCurrencyCompact(v)}
              tick={{ fontSize: 12 }}
              width={64}
            />
            <Tooltip
              formatter={(value, name) => {
                if (Array.isArray(value)) {
                  const [lo, hi] = value as [number, number]
                  return [`${formatCurrency(lo)} – ${formatCurrency(hi)}`, String(name)]
                }
                return [formatCurrency(Number(value)), String(name)]
              }}
              labelFormatter={(year) => {
                const row = baseline.find((r) => r.year === Number(year))
                return row
                  ? `${year} — ${row.people.map((p) => `${p.name} ${p.age}`).join(', ')}`
                  : `${year}`
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            <Area
              dataKey="outer"
              name="Middle 80% of runs"
              stroke="none"
              fill="#2563eb"
              fillOpacity={0.12}
            />
            <Area
              dataKey="inner"
              name="Middle half of runs"
              stroke="none"
              fill="#2563eb"
              fillOpacity={0.25}
            />
            <Line
              type="monotone"
              dataKey="median"
              name="Typical run"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="planned"
              name="Your steady-return plan"
              stroke="#64748b"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
            <ReferenceLine y={0} stroke={ALERT_COLOR} strokeWidth={1} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Returns are drawn at random each year around your assumed rates, so the average is unchanged
        — only the order differs. Volatility of 15% is roughly a global equity fund; cash is nearer
        1%. All pots are treated as equally volatile and moving together, which overstates the swing
        for a cash-heavy mix.
      </p>
    </div>
  )
}
