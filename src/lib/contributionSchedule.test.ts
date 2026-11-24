import { describe, expect, it } from 'vitest'
import {
  coerceAssumptions,
  defaultAssumptions,
  MAX_CONTRIBUTION_STEPS,
  potPresets,
} from './storage'
import { contributionAmountAt, potContributionAt, simulate } from './projection'
import { contributionYears, toggleContributionYear } from './contributionSchedule'
import type { Assumptions, SavingsPot } from './types'

const base = defaultAssumptions
const owner = base.people[0]

function pot(over: Partial<SavingsPot> = {}): SavingsPot {
  return {
    ...base.pots[0],
    id: 'p',
    ownerId: owner.id,
    annualContribution: 1500,
    contributionSchedule: [],
    contributionEndAge: 200,
    contributionEndsAtRetirement: false,
    ...over,
  }
}

describe('contributionAmountAt', () => {
  const stepped = pot({
    annualContribution: 1500,
    contributionSchedule: [
      { id: 'a', fromAge: 45, amount: 0 },
      { id: 'b', fromAge: 52, amount: 6000 },
    ],
  })

  it.each([
    [40, 1500, 'the headline amount applies before any step'],
    [44, 1500, 'and right up to the year before one'],
    [45, 0, 'the first step pauses it'],
    [51, 0, 'and stays in force until the next'],
    [52, 6000, 'the second step resumes it'],
    [90, 6000, 'and the last step runs to the end'],
  ])('at %i pays %i — %s', (age, want) => {
    expect(contributionAmountAt(stepped, age)).toBe(want)
  })

  it('does not care what order the steps are stored in', () => {
    const shuffled = pot({
      annualContribution: 1500,
      contributionSchedule: [
        { id: 'b', fromAge: 52, amount: 6000 },
        { id: 'a', fromAge: 45, amount: 0 },
      ],
    })
    expect(contributionAmountAt(shuffled, 45)).toBe(0)
    expect(contributionAmountAt(shuffled, 52)).toBe(6000)
  })

  it('expresses a pot not being paid into yet as a zero base plus a step', () => {
    const later = pot({
      annualContribution: 0,
      contributionSchedule: [{ id: 'a', fromAge: 48, amount: 2000 }],
    })
    expect(contributionAmountAt(later, 47)).toBe(0)
    expect(contributionAmountAt(later, 48)).toBe(2000)
  })
})

describe('the schedule against the stop age and the bonus', () => {
  const lisaPreset = potPresets.find((x) => x.label.startsWith('Lifetime'))
  if (!lisaPreset) throw new Error('no LISA preset')
  const lisa = pot({
    ...lisaPreset.defaults,
    annualContribution: 0,
    contributionSchedule: [{ id: 'a', fromAge: 45, amount: 4000 }],
  })

  it('pays no bonus in a year nothing goes in', () => {
    expect(potContributionAt(lisa, 44, false, 60)).toBe(0)
  })

  it('tops up whatever the schedule says for that year', () => {
    expect(potContributionAt(lisa, 45, false, 60)).toBe(5000)
  })

  it("lets the pot's own stop age override the schedule", () => {
    expect(potContributionAt(lisa, 50, false, 60)).toBe(0)
  })

  it('stops contributions at retirement whatever the schedule says', () => {
    const stepped = pot({ contributionSchedule: [{ id: 'b', fromAge: 52, amount: 6000 }] })
    expect(potContributionAt(stepped, 55, true, 60)).toBe(0)
  })
})

describe('a scheduled pot through a whole projection', () => {
  const plan: Assumptions = coerceAssumptions({
    ...base,
    people: [{ ...owner, currentAge: 40, retirementAge: 60, lifeExpectancy: 70 }],
    pots: [
      {
        ...pot({
          contributionSchedule: [
            { id: 'a', fromAge: 45, amount: 0 },
            { id: 'b', fromAge: 52, amount: 6000 },
          ],
        }),
        balance: 0,
        growthRate: 0,
        accessibleFromAge: 0,
      },
    ],
    properties: [],
    spendingChanges: [],
    oneOffEvents: [],
  })
  const rows = simulate(plan)
  const at = (age: number) => {
    const row = rows.find((r) => r.age === age)
    if (!row) throw new Error(`no row at ${age}`)
    return row
  }

  it.each([
    [40, 1500],
    [46, 0],
    [55, 6000],
    [60, 0],
  ])('pays in %i at age %i', (age, want) => {
    expect(at(age).potContributions[0]).toBe(want)
  })

  it('pays in the right total over the plan', () => {
    // 40–44 at £1,500 is £7,500; 45–51 nothing; 52–59 at £6,000 is £48,000.
    const paidIn = rows.reduce((sum, r) => sum + r.potContributions[0], 0)
    expect(paidIn).toBe(7500 + 48000)
  })
})

describe('plans saved before schedules existed', () => {
  const legacy = coerceAssumptions({
    ...base,
    pots: [{ ...base.pots[0], contributionSchedule: undefined }],
  })

  it('get an empty schedule', () => {
    expect(legacy.pots[0].contributionSchedule).toHaveLength(0)
  })

  it('and keep paying their flat amount', () => {
    expect(contributionAmountAt(legacy.pots[0], 55)).toBe(base.pots[0].annualContribution)
  })
})

describe('coercing a schedule', () => {
  it('caps the number of steps', () => {
    const flooded = coerceAssumptions({
      ...base,
      pots: [
        {
          ...base.pots[0],
          contributionSchedule: Array.from({ length: 500 }, (_, i) => ({ fromAge: i, amount: 1 })),
        },
      ],
    })
    expect(flooded.pots[0].contributionSchedule).toHaveLength(MAX_CONTRIBUTION_STEPS)
  })

  it('refuses to pay in a negative amount', () => {
    const negative = coerceAssumptions({
      ...base,
      pots: [{ ...base.pots[0], contributionSchedule: [{ fromAge: 50, amount: -9999 }] }],
    })
    expect(negative.pots[0].contributionSchedule[0].amount).toBe(0)
  })
})

describe('the year grid', () => {
  const CURRENT = 40
  const RETIRE = 50 // a short window keeps the expectations readable
  const yearsOf = (p: SavingsPot) => contributionYears(p, CURRENT, 200, RETIRE)
  const pattern = (p: SavingsPot) => yearsOf(p).map((y) => (y.paying ? 1 : 0)).join('')
  const stepPairs = (p: SavingsPot) => p.contributionSchedule.map((s) => [s.fromAge, s.amount])

  it('runs from today to retirement, not past it', () => {
    expect(yearsOf(pot()).map((y) => y.age)).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49])
  })

  it('stops earlier at a pot stop age', () => {
    const years = contributionYears(pot({ contributionEndAge: 45 }), CURRENT, 45, RETIRE)
    expect(years.map((y) => y.age)).toEqual([40, 41, 42, 43, 44])
  })

  it('starts with every year paying', () => {
    expect(pattern(pot())).toBe('1111111111')
  })

  it('needs two steps to switch a single year off', () => {
    const r = toggleContributionYear(yearsOf(pot()), 43, 1500, [])
    expect(r.steps.map((s) => [s.fromAge, s.amount])).toEqual([
      [43, 0],
      [44, 1500],
    ])
    const after = pot({ contributionSchedule: r.steps })
    expect(pattern(after)).toBe('1110111111')
    expect(contributionAmountAt(after, 44)).toBe(1500)
  })

  it('collapses a contiguous run to two steps', () => {
    let p = pot()
    for (const age of [43, 44, 45]) {
      p = pot({
        contributionSchedule: toggleContributionYear(yearsOf(p), age, 1500, p.contributionSchedule)
          .steps,
      })
    }
    expect(stepPairs(p)).toEqual([
      [43, 0],
      [46, 1500],
    ])
    expect(pattern(p)).toBe('1110001111')
  })

  it('restores the stepped amount, not the headline one, when a year goes back on', () => {
    let p = pot({ contributionSchedule: [{ id: 'a', fromAge: 45, amount: 6000 }] })
    expect(pattern(p)).toBe('1111111111')

    p = pot({
      contributionSchedule: toggleContributionYear(yearsOf(p), 46, 1500, p.contributionSchedule)
        .steps,
    })
    expect(contributionAmountAt(p, 46)).toBe(0)
    expect(contributionAmountAt(p, 47)).toBe(6000)

    p = pot({
      contributionSchedule: toggleContributionYear(yearsOf(p), 46, 1500, p.contributionSchedule)
        .steps,
    })
    expect(contributionAmountAt(p, 46)).toBe(6000)
  })

  it('adds a step at the start rather than rewriting the headline amount', () => {
    const p = pot({ contributionSchedule: toggleContributionYear(yearsOf(pot()), 40, 1500, []).steps })
    expect(stepPairs(p)).toEqual([
      [40, 0],
      [41, 1500],
    ])
  })

  it('refuses to switch a year on when there is nothing to pay in', () => {
    const zeroBase = pot({ annualContribution: 0 })
    const result = toggleContributionYear(yearsOf(zeroBase), 42, 0, [])
    expect(result.refused).toBeDefined()
    expect(result.steps).toEqual([])
  })

  it('refuses a pattern needing more steps than it can store, and says why', () => {
    // Alternate years is the pathological case the cap exists for, and it
    // needs a long window to reach: ten years can only ever need ten steps.
    const LONG_RETIRE = 75
    const longYears = (x: SavingsPot) => contributionYears(x, CURRENT, 200, LONG_RETIRE)
    let p = pot()
    let refused: string | undefined
    for (let age = 41; age < LONG_RETIRE; age += 2) {
      const res = toggleContributionYear(longYears(p), age, 1500, p.contributionSchedule)
      if (res.refused) {
        refused = res.refused
        break
      }
      p = pot({ contributionSchedule: res.steps })
    }
    expect(refused).toMatch(/more than 20 changes/)
    expect(p.contributionSchedule.length).toBeLessThanOrEqual(MAX_CONTRIBUTION_STEPS)
  })
})
