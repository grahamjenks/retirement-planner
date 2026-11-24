import { describe, expect, it } from 'vitest'
import { coerceAssumptions, defaultAssumptions, potPresets } from './storage'
import { allSourceIds } from './projection'
import { optimiseDrawdown } from './drawdownOptimiser'
import type { DrawdownGoal } from './drawdownOptimiser'
import type { Assumptions, SavingsPot } from './types'

const base = defaultAssumptions

const me = {
  ...base.people[0],
  id: 'me',
  name: 'Me',
  currentAge: 60,
  retirementAge: 61,
  lifeExpectancy: 85,
  currentPensionPot: 300000,
  employeePensionPct: 0,
  employerPensionPct: 0,
  statePensionAge: 67,
  statePensionAnnual: 11500,
  pensionAccessAge: 57,
}

const sippPreset = potPresets.find((p) => p.label.startsWith('SIPP'))
if (!sippPreset) throw new Error('no SIPP preset')

const isa: SavingsPot = {
  ...potPresets[1].defaults,
  id: 'isa',
  ownerId: 'me',
  balance: 200000,
  annualContribution: 0,
  accessibleFromAge: 0,
  growthRate: 5,
} as SavingsPot

const sipp: SavingsPot = {
  ...sippPreset.defaults,
  id: 'sipp',
  ownerId: 'me',
  balance: 200000,
  annualContribution: 0,
  accessibleFromAge: 57,
  growthRate: 5,
} as SavingsPot

function plan(over: Partial<Assumptions> = {}): Assumptions {
  return coerceAssumptions({
    ...base,
    people: [me],
    pots: [isa, sipp],
    properties: [],
    spendingChanges: [],
    oneOffEvents: [],
    retirementMonthly: 3000,
    retirementAnnualExtras: 0,
    tax: { ...base.tax, enabled: true },
    drawdownStrategy: 'priority',
    drawdownOrder: ['isa', 'sipp', 'pension:me'],
    ...over,
  })
}

const small = plan()
const goals: DrawdownGoal[] = ['mostLeft', 'leastTax', 'lastsLongest']

describe('the recommendation is never worse than what is already set', () => {
  it.each(goals)('%s', (goal) => {
    const { best, current } = optimiseDrawdown(small, goal)

    if (goal === 'mostLeft') expect(best.finalTotal).toBeGreaterThanOrEqual(current.finalTotal - 0.5)
    if (goal === 'leastTax') expect(best.lifetimeTax).toBeLessThanOrEqual(current.lifetimeTax + 0.5)
    if (goal === 'lastsLongest')
      expect(best.runsDryAge ?? Infinity).toBeGreaterThanOrEqual(current.runsDryAge ?? Infinity)

    // Whatever the goal, it must never fund less of the spending.
    expect(best.shortfallTotal).toBeLessThanOrEqual(current.shortfallTotal + 0.5)
  })
})

describe('on a plan small enough to enumerate', () => {
  const result = optimiseDrawdown(small, 'mostLeft')

  it('has three sources to order', () => {
    expect(allSourceIds(small)).toHaveLength(3)
  })

  it('tries every order, plus proportional', () => {
    expect(result.method).toBe('exhaustive')
    expect(result.ordersTried).toBe(6 + 1) // 3! orders and the proportional split
  })

  it('finds nothing better when re-run on its own answer', () => {
    const already = plan({
      drawdownStrategy: result.best.strategy,
      drawdownOrder: result.best.order,
    })
    const again = optimiseDrawdown(already, 'mostLeft')
    expect(again.best.finalTotal).toBeLessThanOrEqual(again.current.finalTotal + 0.5)
  })

  it('beats drawing the ISA first by a worthwhile margin', () => {
    // The point of the whole feature: spending the taxable pension while
    // there is allowance to soak it up beats saving it for last.
    const isaFirst = plan({ drawdownOrder: ['isa', 'sipp', 'pension:me'] })
    const r = optimiseDrawdown(isaFirst, 'leastTax')
    expect(r.current.lifetimeTax - r.best.lifetimeTax).toBeGreaterThan(1000)
  })
})

describe('on a household too big to enumerate', () => {
  const big = coerceAssumptions({
    ...small,
    pots: Array.from({ length: 6 }, (_, i) => ({ ...isa, id: 'pot' + i, balance: 40000 })),
    people: [me, { ...me, id: 'you', name: 'You' }],
  })
  const result = optimiseDrawdown(big, 'mostLeft')

  it('has more sources than the exhaustive limit allows', () => {
    expect(allSourceIds(big).length).toBeGreaterThan(6)
  })

  it('falls back to the search', () => {
    expect(result.method).toBe('search')
  })

  it('keeps the search cheap', () => {
    expect(result.ordersTried).toBeLessThan(400)
  })

  it('still never recommends something worse', () => {
    expect(result.best.finalTotal).toBeGreaterThanOrEqual(result.current.finalTotal - 0.5)
    expect(result.best.shortfallTotal).toBeLessThanOrEqual(result.current.shortfallTotal + 0.5)
  })
})

describe('with a general investment account in the mix', () => {
  // Before the GIA was modelled as taxable it was byte-identical to the ISA,
  // so swapping the two in the order changed nothing and the optimiser had
  // nothing to say about them.
  const giaPreset = potPresets.find((p) => p.label.startsWith('General investment'))
  if (!giaPreset) throw new Error('no GIA preset')

  const gia: SavingsPot = {
    ...giaPreset.defaults,
    id: 'gia',
    ownerId: 'me',
    balance: 200000,
    costBasis: 50000, // three quarters of any sale is gain
    annualContribution: 0,
    accessibleFromAge: 0,
    growthRate: 5,
  } as SavingsPot

  const withGia = (order: string[]): Assumptions =>
    coerceAssumptions({
      ...base,
      people: [me],
      pots: [isa, gia],
      properties: [],
      spendingChanges: [],
      oneOffEvents: [],
      retirementMonthly: 3000,
      retirementAnnualExtras: 0,
      tax: { ...base.tax, enabled: true },
      drawdownStrategy: 'priority',
      drawdownOrder: order,
    })

  it('is no longer interchangeable with the ISA in the order', () => {
    const isaFirst = optimiseDrawdown(withGia(['isa', 'gia', 'pension:me']), 'leastTax').current
    const giaFirst = optimiseDrawdown(withGia(['gia', 'isa', 'pension:me']), 'leastTax').current
    expect(isaFirst.lifetimeTax).not.toBeCloseTo(giaFirst.lifetimeTax, 0)
  })

  it('still never recommends an order that pays more tax', () => {
    const r = optimiseDrawdown(withGia(['isa', 'gia', 'pension:me']), 'leastTax')
    expect(r.best.lifetimeTax).toBeLessThanOrEqual(r.current.lifetimeTax + 0.5)
    expect(r.best.shortfallTotal).toBeLessThanOrEqual(r.current.shortfallTotal + 0.5)
  })

  it('still never recommends an order that leaves less behind', () => {
    const r = optimiseDrawdown(withGia(['isa', 'gia', 'pension:me']), 'mostLeft')
    expect(r.best.finalTotal).toBeGreaterThanOrEqual(r.current.finalTotal - 0.5)
  })
})
