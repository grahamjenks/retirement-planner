import { amountFromSchedule } from './projection'
import { MAX_CONTRIBUTION_STEPS, newId } from './storage'
import type { ContributionStep, SavingsPot } from './types'

/**
 * The years a pot can be paid into, and what goes in each one.
 *
 * The step list says what changes and when; this says what happens, year by
 * year. They are two views of the same thing, which is the point: ticking a
 * year off in the grid rewrites the steps rather than recording the same fact
 * in a second place, so the two can never disagree.
 */
export interface ContributionYear {
  age: number
  amount: number
  paying: boolean
}

/**
 * The window in which contributions can actually happen: from the owner's age
 * today until whichever comes first, the pot's own stop age or the owner
 * retiring. Past either, the projection pays nothing in whatever the schedule
 * says, so offering those years would be offering a lie.
 */
export function contributionWindow(
  pot: SavingsPot,
  currentAge: number,
  endAge: number,
  retirementAge: number,
): { from: number; to: number } {
  void pot
  return { from: currentAge, to: Math.min(endAge, retirementAge) }
}

/**
 * The same view for anything that has a headline amount and a step list — a
 * savings pot, or a person's pension contributions, where the amount is a
 * percentage of salary rather than a sum of money.
 */
export function scheduleYears(
  base: number,
  steps: readonly ContributionStep[],
  currentAge: number,
  endAge: number,
  retirementAge: number,
): ContributionYear[] {
  const to = Math.min(endAge, retirementAge)
  const years: ContributionYear[] = []
  for (let age = currentAge; age < to; age++) {
    const amount = amountFromSchedule(base, steps, age)
    years.push({ age, amount, paying: amount > 0 })
  }
  return years
}

export function contributionYears(
  pot: SavingsPot,
  currentAge: number,
  endAge: number,
  retirementAge: number,
): ContributionYear[] {
  const { from, to } = contributionWindow(pot, currentAge, endAge, retirementAge)
  return scheduleYears(pot.annualContribution, pot.contributionSchedule, from, to, to)
}

/**
 * Turns a year-by-year list back into the shortest set of steps that produces
 * it: one wherever the amount changes from the year before, plus one at the
 * start if the first year differs from the pot's headline amount.
 *
 * The headline amount is left alone deliberately. It is the figure someone
 * typed into "Per year", and rewriting it under them because they unticked
 * the first year would be a surprise.
 */
export function stepsFromYears(
  years: ContributionYear[],
  baseAmount: number,
  existing: ContributionStep[],
): ContributionStep[] {
  // Reuse a step's id where one already sits on that age, so React keeps the
  // row rather than remounting it mid-edit.
  const idAt = new Map(existing.map((s) => [s.fromAge, s.id]))
  const steps: ContributionStep[] = []
  let previous = baseAmount
  for (const year of years) {
    if (year.amount !== previous) {
      steps.push({ id: idAt.get(year.age) ?? newId(), fromAge: year.age, amount: year.amount })
      previous = year.amount
    }
  }
  return steps
}

/**
 * What a year should pay in when it is ticked back on: whatever the nearest
 * paying year was, looking back first and then forward, falling back to the
 * pot's headline amount. Turning a year on should restore what it used to
 * get, not silently set it to nothing.
 */
function amountToRestore(years: ContributionYear[], index: number, baseAmount: number): number {
  for (let i = index - 1; i >= 0; i--) if (years[i].amount > 0) return years[i].amount
  for (let i = index + 1; i < years.length; i++) if (years[i].amount > 0) return years[i].amount
  return baseAmount > 0 ? baseAmount : 0
}

export interface ToggleResult {
  steps: ContributionStep[]
  /** Set when the change was refused, with the reason to show. */
  refused?: string
}

/**
 * Ticks one year on or off and re-encodes the schedule.
 *
 * A pattern with more changes than the stored schedule can hold is refused
 * rather than silently truncated — losing the tail of someone's plan to a
 * stray click is worse than saying no.
 */
export function toggleContributionYear(
  years: ContributionYear[],
  age: number,
  baseAmount: number,
  existing: ContributionStep[],
): ToggleResult {
  const index = years.findIndex((y) => y.age === age)
  if (index < 0) return { steps: existing }

  const next = years.map((y) => ({ ...y }))
  const turningOn = !next[index].paying
  next[index].amount = turningOn ? amountToRestore(years, index, baseAmount) : 0
  next[index].paying = next[index].amount > 0

  if (turningOn && next[index].amount <= 0) {
    return {
      steps: existing,
      refused: 'Set an amount in "Per year" first — there is nothing to pay in.',
    }
  }

  const steps = stepsFromYears(next, baseAmount, existing)
  if (steps.length > MAX_CONTRIBUTION_STEPS) {
    return {
      steps: existing,
      refused: `That would need more than ${MAX_CONTRIBUTION_STEPS} changes of amount. Try switching off a run of years rather than alternate ones.`,
    }
  }
  return { steps }
}
