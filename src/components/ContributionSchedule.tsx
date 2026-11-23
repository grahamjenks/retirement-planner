import { useState } from 'react'
import { formatCurrency } from '../lib/format'
import { contributionYears, toggleContributionYear } from '../lib/contributionSchedule'
import { newId } from '../lib/storage'
import type { ContributionStep, SavingsPot } from '../lib/types'
import { NumberField } from './NumberField'

interface ContributionScheduleProps {
  pot: SavingsPot
  /** What goes in before the first step. */
  baseAmount: number
  ownerName: string
  currentAge: number
  /** Where contributions stop for good, whatever the schedule says. */
  endAge: number
  retirementAge: number
  steps: ContributionStep[]
  onChange: (steps: ContributionStep[]) => void
}

export function ContributionSchedule({
  pot,
  baseAmount,
  ownerName,
  currentAge,
  endAge,
  retirementAge,
  steps,
  onChange,
}: ContributionScheduleProps) {
  const [refused, setRefused] = useState<string | null>(null)
  const years = contributionYears(pot, currentAge, endAge, retirementAge)

  function toggleYear(age: number) {
    const result = toggleContributionYear(years, age, baseAmount, steps)
    setRefused(result.refused ?? null)
    if (!result.refused) onChange(result.steps)
  }
  const byAge = (x: ContributionStep, y: ContributionStep) => x.fromAge - y.fromAge
  /*
   * Rows keep the order they are stored in while you are editing them.
   * Re-sorting on every keystroke means a row leaps up the list the moment
   * you type the "5" of "52", and you finish typing into whatever slid into
   * its place. Sorting happens when a step is added or removed instead —
   * moments where nothing is mid-edit. The projection reads the steps by age
   * and ignores their order, so this is purely about where rows sit.
   */
  function update(id: string, patch: Partial<ContributionStep>) {
    onChange(steps.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function remove(id: string) {
    onChange(steps.filter((c) => c.id !== id).sort(byAge))
  }

  function add() {
    const latest = steps.reduce((most, c) => Math.max(most, c.fromAge), currentAge)
    return onChange(
      [
        ...steps,
        // A new step defaults to pausing, because that is the change people
        // reach for first; the amount is one edit away either way.
        { id: newId(), fromAge: Math.min(endAge, latest + 5), amount: 0 },
      ].sort(byAge),
    )
  }

  return (
    <div className="space-y-3">
      {years.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            Years you pay in
          </p>
          <div className="flex flex-wrap gap-1">
            {years.map((year) => (
              <button
                key={year.age}
                type="button"
                role="switch"
                aria-checked={year.paying}
                onClick={() => toggleYear(year.age)}
                title={
                  year.paying
                    ? `Age ${year.age}: ${formatCurrency(year.amount)} — click to skip this year`
                    : `Age ${year.age}: nothing — click to pay in`
                }
                className={`w-9 rounded-md border py-1 text-[11px] font-medium tabular-nums transition-colors ${
                  year.paying
                    ? 'border-ink-600 bg-ink-600 text-white hover:bg-ink-700'
                    : 'border-slate-300 bg-white text-slate-400 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                {year.age}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {ownerName}'s age. Filled years pay in; click one to skip it. Contributions stop at{' '}
            {Math.min(endAge, retirementAge)} whatever is ticked here.
          </p>
          {refused && (
            <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              {refused}
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        From {ownerName}'s age <strong>{currentAge}</strong>:{' '}
        <strong>{formatCurrency(baseAmount)}</strong> a year
        {baseAmount === 0 && <> — nothing goes in until a step below says otherwise</>}
      </div>

      {steps.map((step) => {
        const pastEnd = step.fromAge >= endAge
        const beforeNow = step.fromAge <= currentAge
        return (
          <div
            key={step.id}
            className="rounded-lg border border-slate-200 p-2 dark:border-slate-600"
          >
            <div className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-2 gap-2">
                <NumberField
                  label="From age"
                  value={step.fromAge}
                  onChange={(v) => update(step.id, { fromAge: v })}
                  min={0}
                  max={120}
                />
                <NumberField
                  label="Pay in"
                  value={step.amount}
                  onChange={(v) => update(step.id, { amount: v })}
                  prefix="£"
                  step={250}
                  hint={step.amount === 0 ? 'Paused' : undefined}
                />
              </div>
              <button
                type="button"
                onClick={() => remove(step.id)}
                className="mt-6 shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                aria-label={`Remove contribution change at age ${step.fromAge}`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            {pastEnd && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Contributions already stop at {endAge}, so this never takes effect.
              </p>
            )}
            {!pastEnd && beforeNow && (
              <p className="mt-1 text-xs text-slate-400">
                At or before {ownerName}'s age today, so this applies from the start.
              </p>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={add}
        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-ink-400 hover:text-ink-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-ink-500 dark:hover:text-ink-400"
      >
        + Change the amount at an age
      </button>
    </div>
  )
}
