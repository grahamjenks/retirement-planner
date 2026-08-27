import { potsExhaustedRow, shortfallSummary, simulate } from './projection'
import type { Assumptions } from './types'

/**
 * A single continuous score for "how well did the plan go", so outcomes stay
 * comparable across scenarios. Positive is money left at the end; negative is
 * the total shortfall of a plan that failed. Without this, a plan that already
 * fails scores zero under every variation and nothing can be ranked.
 */
export function planHeadroom(a: Assumptions): {
  headroom: number
  runsDryAge: number | null
  finalPot: number
  totalShortfall: number
} {
  const rows = simulate(a)
  const last = rows[rows.length - 1]
  const dry = potsExhaustedRow(rows)
  const totalShortfall = shortfallSummary(a, rows).total
  const finalPot = last ? last.totalPot : 0
  return {
    headroom: totalShortfall > 0.01 ? -totalShortfall : finalPot,
    runsDryAge: dry ? dry.people[0].age : null,
    finalPot,
    totalShortfall,
  }
}

export interface TradeoffPoint {
  retirementAge: number
  runsDryAge: number | null
  finalPot: number
  totalShortfall: number
  sustainable: boolean
}

/**
 * Outcome at every retirement age for one person, holding everyone else's plan
 * fixed. Shows the price of each extra year worked, rather than just the single
 * earliest age that happens to work.
 */
export function retirementTradeoff(
  a: Assumptions,
  personId: string,
  maxAge = 75,
): TradeoffPoint[] {
  const person = a.people.find((p) => p.id === personId)
  if (!person) return []
  const points: TradeoffPoint[] = []
  for (let age = person.currentAge + 1; age <= maxAge; age++) {
    const variant: Assumptions = {
      ...a,
      people: a.people.map((p) => (p.id === personId ? { ...p, retirementAge: age } : p)),
    }
    const r = planHeadroom(variant)
    points.push({
      retirementAge: age,
      runsDryAge: r.runsDryAge,
      finalPot: r.finalPot,
      totalShortfall: r.totalShortfall,
      sustainable: r.totalShortfall <= 0.01,
    })
  }
  return points
}

export interface SensitivityFactor {
  label: string
  lowLabel: string
  highLabel: string
  lowHeadroom: number
  highHeadroom: number
  /** How far the outcome moves between the two ends — the ranking. */
  swing: number
}

const clone = (a: Assumptions): Assumptions => structuredClone(a)

/** Shifts every investment growth rate by the same number of points. */
function shiftGrowth(a: Assumptions, points: number): Assumptions {
  const next = clone(a)
  next.pots = next.pots.map((p) => ({ ...p, growthRate: Math.max(0, p.growthRate + points) }))
  next.people = next.people.map((p) => ({
    ...p,
    pensionGrowthRate: Math.max(0, p.pensionGrowthRate + points),
  }))
  return next
}

function scaleRetirementSpend(a: Assumptions, factor: number): Assumptions {
  const next = clone(a)
  next.retirementMonthly = next.retirementMonthly * factor
  next.retirementAnnualExtras = next.retirementAnnualExtras * factor
  next.spendingChanges = next.spendingChanges.map((b) => ({ ...b, amount: b.amount * factor }))
  return next
}

/**
 * Re-runs the plan with each assumption pushed to either end of a plausible
 * range, one at a time, so they can be ranked by how much they actually move
 * the outcome.
 */
export function sensitivity(a: Assumptions): SensitivityFactor[] {
  const factors: SensitivityFactor[] = []

  const add = (
    label: string,
    lowLabel: string,
    low: Assumptions,
    highLabel: string,
    high: Assumptions,
  ) => {
    const l = planHeadroom(low).headroom
    const h = planHeadroom(high).headroom
    factors.push({ label, lowLabel, highLabel, lowHeadroom: l, highHeadroom: h, swing: Math.abs(h - l) })
  }

  add('Investment growth', '−2%', shiftGrowth(a, -2), '+2%', shiftGrowth(a, 2))

  const infLow = clone(a)
  infLow.inflationRate = Math.max(0, a.inflationRate - 1)
  const infHigh = clone(a)
  infHigh.inflationRate = a.inflationRate + 1
  add('Inflation', `${infLow.inflationRate}%`, infLow, `${infHigh.inflationRate}%`, infHigh)

  add('Retirement spending', '−10%', scaleRetirementSpend(a, 0.9), '+10%', scaleRetirementSpend(a, 1.1))

  const lifeLow = clone(a)
  lifeLow.people = lifeLow.people.map((p) => ({ ...p, lifeExpectancy: p.lifeExpectancy - 5 }))
  const lifeHigh = clone(a)
  lifeHigh.people = lifeHigh.people.map((p) => ({ ...p, lifeExpectancy: p.lifeExpectancy + 5 }))
  add('Living 5 years longer', '−5 yrs', lifeLow, '+5 yrs', lifeHigh)

  const payLow = clone(a)
  payLow.people = payLow.people.map((p) => ({
    ...p,
    salaryGrowthRate: Math.max(0, p.salaryGrowthRate - 1),
  }))
  const payHigh = clone(a)
  payHigh.people = payHigh.people.map((p) => ({
    ...p,
    salaryGrowthRate: p.salaryGrowthRate + 1,
  }))
  add('Pay growth', '−1%', payLow, '+1%', payHigh)

  const spLow = clone(a)
  spLow.people = spLow.people.map((p) => ({ ...p, statePensionAnnual: p.statePensionAnnual * 0.75 }))
  const spHigh = clone(a)
  spHigh.people = spHigh.people.map((p) => ({ ...p, statePensionAnnual: p.statePensionAnnual * 1.25 }))
  add('State pension', '−25%', spLow, '+25%', spHigh)

  return factors.sort((x, y) => y.swing - x.swing)
}
