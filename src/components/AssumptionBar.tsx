import { realRate } from '../lib/projection'
import type { Assumptions } from '../lib/types'
import { PENSION_COLORS, POT_COLORS } from './chartColors'

interface AssumptionBarProps {
  assumptions: Assumptions
  onChange: (next: Assumptions) => void
}

interface RateSliderProps {
  label: string
  color: string
  value: number
  realPct: number | null
  onChange: (value: number) => void
  max?: number
}

/**
 * The rates worth pushing around while watching the results, surfaced next to
 * the retirement ages. Same values as the sidebar fields — a second way in, not
 * a second source of truth.
 */
function RateSlider({ label, color, value, realPct, onChange, max = 12 }: RateSliderProps) {
  return (
    <label className="min-w-[9.5rem] flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-xs text-slate-600 dark:text-slate-300">{label}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-blue-600 tabular-nums dark:text-blue-400">
          {value}%
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="mt-1 w-full cursor-pointer"
      />
      <span className="block text-[10px] text-slate-400 tabular-nums">
        {realPct === null ? 'sets the real value of everything else' : `${realPct.toFixed(2)}% real`}
      </span>
    </label>
  )
}

export function AssumptionBar({ assumptions: a, onChange }: AssumptionBarProps) {
  const dcPeople = a.people.filter((p) => p.pensionType === 'dc')

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
        Growth &amp; inflation
        <span className="ml-2 font-normal text-slate-400">
          rates as normally quoted; the figure beneath each is what's left after inflation
        </span>
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <RateSlider
          label="Inflation"
          color="#f59e0b"
          value={a.inflationRate}
          realPct={null}
          max={8}
          onChange={(v) => onChange({ ...a, inflationRate: v })}
        />

        {dcPeople.map((person, i) => (
          <RateSlider
            key={person.id}
            label={`${person.name}: pension`}
            color={PENSION_COLORS[i % PENSION_COLORS.length]}
            value={person.pensionGrowthRate}
            realPct={realRate(person.pensionGrowthRate, a.inflationRate) * 100}
            onChange={(v) =>
              onChange({
                ...a,
                people: a.people.map((p) =>
                  p.id === person.id ? { ...p, pensionGrowthRate: v } : p,
                ),
              })
            }
          />
        ))}

        {a.pots.map((pot, i) => (
          <RateSlider
            key={pot.id}
            label={pot.name}
            color={POT_COLORS[i % POT_COLORS.length]}
            value={pot.growthRate}
            realPct={realRate(pot.growthRate, a.inflationRate) * 100}
            onChange={(v) =>
              onChange({
                ...a,
                pots: a.pots.map((p) => (p.id === pot.id ? { ...p, growthRate: v } : p)),
              })
            }
          />
        ))}
      </div>
    </div>
  )
}
