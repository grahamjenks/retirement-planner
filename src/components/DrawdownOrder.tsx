import { useState } from 'react'
import { formatCurrency } from '../lib/format'
import { allSourceIds, resolveDrawdownOrder } from '../lib/projection'
import { drawdownGoals, optimiseDrawdown } from '../lib/drawdownOptimiser'
import type { DrawdownGoal, OptimisationResult } from '../lib/drawdownOptimiser'
import { personIdFromSource } from '../lib/types'
import type { Assumptions, DrawdownStrategy } from '../lib/types'
import { PENSION_COLORS, POT_COLORS } from './chartColors'

interface DrawdownOrderProps {
  assumptions: Assumptions
  onStrategyChange: (strategy: DrawdownStrategy) => void
  onOrderChange: (order: string[]) => void
  /** Applies a whole recommendation — strategy and order together. */
  onApply: (strategy: DrawdownStrategy, order: string[]) => void
}

export function DrawdownOrder({
  assumptions: a,
  onStrategyChange,
  onOrderChange,
  onApply,
}: DrawdownOrderProps) {
  const resolved = resolveDrawdownOrder(a, a.drawdownOrder)
  const [goal, setGoal] = useState<DrawdownGoal>('mostLeft')
  /*
   * The search runs on a button rather than with the rest of the projection.
   * Trying every order of six sources is 720 simulations — fast enough to
   * wait for once, far too slow to repeat on every keystroke in the sidebar.
   * The plan it ran against is kept alongside it, so an edit anywhere quietly
   * retires the answer instead of leaving a stale recommendation on screen.
   */
  const [found, setFound] = useState<{ result: OptimisationResult; of: Assumptions } | null>(null)
  const result = found && found.of === a && found.result.goal === goal ? found.result : null
  const strategy = a.drawdownStrategy
  const dcPeople = a.people.filter((p) => p.pensionType === 'dc')

  function labelFor(id: string): { name: string; color: string } {
    const personId = personIdFromSource(id)
    if (personId) {
      const idx = dcPeople.findIndex((p) => p.id === personId)
      const person = dcPeople[idx]
      return {
        name: person ? `${person.name}: pension` : 'Pension',
        color: PENSION_COLORS[Math.max(0, idx) % PENSION_COLORS.length],
      }
    }
    const idx = a.pots.findIndex((p) => p.id === id)
    return {
      name: a.pots[idx]?.name ?? 'Unknown pot',
      color: POT_COLORS[Math.max(0, idx) % POT_COLORS.length],
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= resolved.length) return
    const next = [...resolved]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onOrderChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <StrategyOption
          label="Spread across all pots"
          description="Each year's shortfall is taken from every unlocked pot in proportion, so they shrink together."
          checked={strategy === 'proportional'}
          onSelect={() => onStrategyChange('proportional')}
        />
        <StrategyOption
          label="Use pots in a set order"
          description="Empty the first pot before touching the next. Useful for spending taxable money first."
          checked={strategy === 'priority'}
          onSelect={() => onStrategyChange('priority')}
        />
      </div>

      <OptimiserPanel
        assumptions={a}
        goal={goal}
        onGoalChange={setGoal}
        result={result}
        onRun={() => setFound({ result: optimiseDrawdown(a, goal), of: a })}
        onApply={onApply}
        labelFor={labelFor}
      />

      <div className="space-y-1.5">
        {strategy === 'priority' ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Drawn from top to bottom. A pot that's still locked is skipped until it unlocks.
            Salary-based pensions never appear here — they pay an income, not a pot.
          </p>
        ) : (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            This order is <strong>not being used</strong> — every unlocked pot is drawn on at once.
            Choose "Use pots in a set order" above to apply it.
          </p>
        )}
        <div className={strategy === 'priority' ? '' : 'pointer-events-none opacity-40'}>
          {resolved.map((id, i) => {
            const { name, color } = labelFor(id)
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600"
              >
                <span className="w-4 shrink-0 text-xs font-semibold text-slate-400 tabular-nums">
                  {i + 1}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0 || strategy !== 'priority'}
                  className="shrink-0 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label={`Move ${name} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === resolved.length - 1 || strategy !== 'priority'}
                  className="shrink-0 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label={`Move ${name} later`}
                >
                  ↓
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Runs the order search and says what it found, in the terms of the goal that
 * was asked for.
 *
 * Deliberately shows the figure the goal is about *and* what it costs
 * elsewhere: the order that pays the least tax is usually not the one that
 * leaves the most behind, and recommending one without showing the other
 * would hide the trade being made.
 */
function OptimiserPanel({
  assumptions: a,
  goal,
  onGoalChange,
  result,
  onRun,
  onApply,
  labelFor,
}: {
  assumptions: Assumptions
  goal: DrawdownGoal
  onGoalChange: (goal: DrawdownGoal) => void
  result: OptimisationResult | null
  onRun: () => void
  onApply: (strategy: DrawdownStrategy, order: string[]) => void
  labelFor: (id: string) => { name: string; color: string }
}) {
  const sources = allSourceIds(a)
  if (sources.length < 2) return null

  const best = result?.best
  const current = result?.current
  const changed =
    best !== undefined &&
    current !== undefined &&
    (best.strategy !== current.strategy || best.order.join() !== current.order.join())

  /*
   * All three measures, whichever goal was asked for. On a plan whose pots
   * empty, "most left at the end" is £0 either way and the real gain is in
   * the tax bill or in how long the money lasts — showing only the goal's own
   * figure would make a worthwhile change look like it achieved nothing.
   */
  const dryText = (age: number | null) => (age === null ? 'Never' : `Age ${age}`)
  const figures =
    best && current
      ? [
          {
            label: 'Left at the end',
            now: formatCurrency(current.finalTotal),
            then: formatCurrency(best.finalTotal),
            delta: best.finalTotal - current.finalTotal,
            betterWhen: 'higher' as const,
          },
          {
            label: 'Tax over the plan',
            now: formatCurrency(current.lifetimeTax),
            then: formatCurrency(best.lifetimeTax),
            delta: best.lifetimeTax - current.lifetimeTax,
            betterWhen: 'lower' as const,
          },
          {
            label: 'Pots run dry',
            now: dryText(current.runsDryAge),
            then: dryText(best.runsDryAge),
            delta: (best.runsDryAge ?? 999) - (current.runsDryAge ?? 999),
            betterWhen: 'higher' as const,
          },
        ]
      : []

  return (
    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-600">
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Find the order that gives me
        </span>
        <select
          value={goal}
          onChange={(e) => onGoalChange(e.target.value as DrawdownGoal)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          {drawdownGoals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-slate-400">
        {drawdownGoals.find((g) => g.id === goal)?.description}
      </p>

      <button
        type="button"
        onClick={onRun}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {result ? 'Search again' : 'Find the best order'}
      </button>

      {result && best && (
        <div className="mt-2 space-y-2">
          {!changed ? (
            <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              Your current setting is already the best of the{' '}
              {result.ordersTried.toLocaleString()} ways tried.
            </p>
          ) : (
            <>
              <div className="rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {best.strategy === 'proportional' ? (
                  <>
                    Better: <strong>spread across all pots</strong> rather than a set order.
                  </>
                ) : (
                  <>
                    Better order:{' '}
                    <strong>{best.order.map((id) => labelFor(id).name).join(' → ')}</strong>
                  </>
                )}
              </div>

              <ul className="space-y-1">
                {figures.map((f) => {
                  const delta = f.delta
                  const good = f.betterWhen === 'higher' ? delta > 0 : delta < 0
                  return (
                    <li
                      key={f.label}
                      className="flex items-baseline justify-between gap-2 text-xs"
                    >
                      <span className="text-slate-500 dark:text-slate-400">{f.label}</span>
                      <span className="shrink-0 tabular-nums">
                        {/* Striking through a figure that did not move reads
                            as a change that was not made. */}
                        {f.now !== f.then && (
                          <span className="text-slate-400 line-through">{f.now} </span>
                        )}
                        <strong
                          className={
                            f.now === f.then
                              ? 'text-slate-500 dark:text-slate-400'
                              : good
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                          }
                        >
                          {f.then}
                        </strong>
                      </span>
                    </li>
                  )
                })}
              </ul>

              <button
                type="button"
                onClick={() => onApply(best.strategy, best.order)}
                className="w-full rounded-lg bg-ink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-700"
              >
                Use this order
              </button>
            </>
          )}
          <p className="text-[11px] text-slate-400">
            {result.method === 'exhaustive'
              ? `Every possible order was tried — ${(result.ordersTried - 1).toLocaleString()} of them, plus spreading across all pots — so nothing beats this on the goal above.`
              : `Too many orders to try them all, so ${result.ordersTried.toLocaleString()} promising ones were searched: a good order, not a proven one.`}{' '}
            Funding the plan always comes first: an order is never recommended for leaving more
            behind if it falls short in some year.
          </p>
        </div>
      )}
    </div>
  )
}

interface StrategyOptionProps {
  label: string
  description: string
  checked: boolean
  onSelect: () => void
}

function StrategyOption({ label, description, checked, onSelect }: StrategyOptionProps) {
  return (
    <label
      className={`flex cursor-pointer gap-2 rounded-lg border p-2 ${
        checked
          ? 'border-ink-500 bg-ink-50 dark:border-ink-500 dark:bg-ink-950/40'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-600'
      }`}
    >
      <input
        type="radio"
        name="drawdown-strategy"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ink-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
      </span>
    </label>
  )
}
