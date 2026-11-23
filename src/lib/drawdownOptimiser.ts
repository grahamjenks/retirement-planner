import {
  allSourceIds,
  potsExhaustedRow,
  resolveDrawdownOrder,
  simulate,
} from './projection'
import type { Assumptions, DrawdownStrategy, YearRow } from './types'

/**
 * What "best" means. The order that leaves the most behind is rarely the one
 * that pays the least tax, so this is the user's call rather than ours.
 */
export type DrawdownGoal = 'mostLeft' | 'leastTax' | 'lastsLongest'

export const drawdownGoals: { id: DrawdownGoal; label: string; description: string }[] = [
  {
    id: 'mostLeft',
    label: 'Most left at the end',
    description: 'The largest pot still standing at the end of the plan.',
  },
  {
    id: 'leastTax',
    label: 'Least tax paid',
    description: 'The smallest income tax bill across the whole plan.',
  },
  {
    id: 'lastsLongest',
    label: 'Money lasts longest',
    description: 'Pushes the year the pots run dry as late as it will go.',
  },
]

export interface OrderOutcome {
  strategy: DrawdownStrategy
  /** Empty when the strategy is proportional, which uses no order. */
  order: string[]
  /** Total missed across every year. Nothing else matters while this is above zero. */
  shortfallTotal: number
  /** Pots and pensions still standing in the final year. */
  finalTotal: number
  /** Income tax across the whole plan. */
  lifetimeTax: number
  /** Age of the first person when the pots empty, or null if they never do. */
  runsDryAge: number | null
}

export interface OptimisationResult {
  best: OrderOutcome
  current: OrderOutcome
  /**
   * `exhaustive` means every order was tried, so `best` is the best there is.
   * `search` means a greedy build plus pairwise swaps — a good order, not a
   * proven one.
   */
  method: 'exhaustive' | 'search'
  ordersTried: number
  goal: DrawdownGoal
}

/**
 * Orders tried in full before falling back to a search. Six sources is 720
 * orders at about a third of a millisecond each, which a button press can
 * absorb; seven would be 5,040 and over a second of frozen page.
 */
const MAX_EXHAUSTIVE = 720

function measure(a: Assumptions, strategy: DrawdownStrategy, order: string[]): OrderOutcome {
  const rows: YearRow[] = simulate({ ...a, drawdownStrategy: strategy, drawdownOrder: order })
  const exhausted = potsExhaustedRow(rows)
  let shortfallTotal = 0
  let lifetimeTax = 0
  for (const r of rows) {
    shortfallTotal += r.shortfall
    lifetimeTax += r.taxPaid
  }
  return {
    strategy,
    order: strategy === 'priority' ? order : [],
    shortfallTotal,
    finalTotal: rows.length > 0 ? rows[rows.length - 1].totalPot : 0,
    lifetimeTax,
    runsDryAge: exhausted ? exhausted.people[0].age : null,
  }
}

/**
 * Lower is better. Falling short always loses to not falling short, whatever
 * the goal: an order that pays less tax by running out of money sooner has
 * not won anything. Only when two candidates are equally funded does the goal
 * decide, and `finalTotal` breaks the remaining ties so the comparison is
 * total rather than leaving equal-looking orders in arbitrary order.
 */
function scoreOf(outcome: OrderOutcome, goal: DrawdownGoal): [number, number, number] {
  const funded = Math.round(outcome.shortfallTotal)
  switch (goal) {
    case 'leastTax':
      return [funded, Math.round(outcome.lifetimeTax), -Math.round(outcome.finalTotal)]
    case 'lastsLongest':
      // Never running dry is the best possible answer, so it sorts ahead of
      // every real age rather than being absent from the comparison.
      return [funded, -(outcome.runsDryAge ?? Infinity), -Math.round(outcome.finalTotal)]
    case 'mostLeft':
      return [funded, -Math.round(outcome.finalTotal), Math.round(outcome.lifetimeTax)]
  }
}

function better(x: OrderOutcome, y: OrderOutcome, goal: DrawdownGoal): boolean {
  const sx = scoreOf(x, goal)
  const sy = scoreOf(y, goal)
  for (let i = 0; i < sx.length; i++) {
    if (sx[i] !== sy[i]) return sx[i] < sy[i]
  }
  return false
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items]
    return
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const tail of permutations(rest)) yield [items[i], ...tail]
  }
}

function factorial(n: number): number {
  let total = 1
  for (let i = 2; i <= n; i++) total *= i
  return total
}

/**
 * Builds an order a position at a time, each time taking whichever source
 * left unplaced scores best in that slot, then tries swapping every pair
 * until no swap helps. Used when there are too many orders to try them all.
 */
function searchOrder(
  a: Assumptions,
  sources: string[],
  goal: DrawdownGoal,
): { best: OrderOutcome; tried: number } {
  let tried = 0
  const chosen: string[] = []
  const remaining = [...sources]

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestOutcome: OrderOutcome | null = null
    remaining.forEach((id, i) => {
      // The tail keeps its current order, so each trial is a whole, valid
      // order rather than a partial one that cannot be simulated.
      const candidate = [...chosen, id, ...remaining.filter((other) => other !== id)]
      const outcome = measure(a, 'priority', candidate)
      tried++
      if (bestOutcome === null || better(outcome, bestOutcome, goal)) {
        bestOutcome = outcome
        bestIndex = i
      }
    })
    chosen.push(remaining[bestIndex])
    remaining.splice(bestIndex, 1)
  }

  let best = measure(a, 'priority', chosen)
  tried++
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < chosen.length - 1 && !improved; i++) {
      for (let j = i + 1; j < chosen.length && !improved; j++) {
        const swapped = [...chosen]
        ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
        const outcome = measure(a, 'priority', swapped)
        tried++
        if (better(outcome, best, goal)) {
          best = outcome
          chosen.splice(0, chosen.length, ...swapped)
          improved = true
        }
      }
    }
  }
  return { best, tried }
}

/**
 * Finds the drawdown order that serves a goal best, and says how it compares
 * with what the plan does today.
 *
 * Spreading across all pots competes as a candidate in its own right: it is a
 * real alternative, and on plans where every pot unlocks together it often
 * wins, so leaving it out would recommend an order nobody needed.
 */
export function optimiseDrawdown(a: Assumptions, goal: DrawdownGoal): OptimisationResult {
  const sources = allSourceIds(a)
  const current = measure(a, a.drawdownStrategy, resolveDrawdownOrder(a, a.drawdownOrder))

  if (sources.length < 2) {
    return { best: current, current, method: 'exhaustive', ordersTried: 1, goal }
  }

  const proportional = measure(a, 'proportional', [])
  let best = proportional
  let tried = 1
  let method: OptimisationResult['method'] = 'exhaustive'

  if (factorial(sources.length) <= MAX_EXHAUSTIVE) {
    for (const order of permutations(sources)) {
      const outcome = measure(a, 'priority', order)
      tried++
      if (better(outcome, best, goal)) best = outcome
    }
  } else {
    method = 'search'
    const found = searchOrder(a, sources, goal)
    tried += found.tried
    if (better(found.best, best, goal)) best = found.best
  }

  // Never recommend a change that is not an improvement on what is set today.
  if (better(current, best, goal)) best = current
  return { best, current, method, ordersTried: tried, goal }
}
