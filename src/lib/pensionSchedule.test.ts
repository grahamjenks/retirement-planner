import { describe, expect, it } from 'vitest'
import { coerceAssumptions, defaultAssumptions, MAX_CONTRIBUTION_STEPS } from './storage'
import {
  annualPensionContribution,
  contributionPctFor,
  pensionPctAt,
  simulate,
  takeHomeBase,
} from './projection'
import { scheduleYears, toggleContributionYear } from './contributionSchedule'
import type { Assumptions, Person } from './types'

const base = defaultAssumptions

function person(over: Partial<Person> = {}): Person {
  return {
    ...base.people[0],
    currentAge: 40,
    retirementAge: 60,
    currentAnnualIncome: 50000,
    employeePensionPct: 5,
    employerPensionPct: 3,
    pensionSchedule: [],
    ...over,
  }
}

describe('pensionPctAt', () => {
  it('uses the headline percentages when nothing is scheduled', () => {
    expect(pensionPctAt(person(), 45)).toEqual({ employeePct: 5, employerPct: 3 })
  })

  it('pauses both halves when a step says nothing goes in', () => {
    const p = person({ pensionSchedule: [{ id: 'a', fromAge: 45, amount: 0 }] })
    expect(pensionPctAt(p, 44)).toEqual({ employeePct: 5, employerPct: 3 })
    expect(pensionPctAt(p, 45)).toEqual({ employeePct: 0, employerPct: 0 })
  })

  it('keeps the employee/employer ratio when the rate changes', () => {
    // 8% combined, split 5:3. Halve it and the split must hold.
    const p = person({ pensionSchedule: [{ id: 'a', fromAge: 50, amount: 4 }] })
    const at50 = pensionPctAt(p, 50)
    expect(at50.employeePct).toBeCloseTo(2.5, 6)
    expect(at50.employerPct).toBeCloseTo(1.5, 6)
    expect(at50.employeePct + at50.employerPct).toBeCloseTo(4, 6)
  })

  it('counts it all as the employee when there is no ratio to keep', () => {
    const p = person({
      employeePensionPct: 0,
      employerPensionPct: 0,
      pensionSchedule: [{ id: 'a', fromAge: 45, amount: 6 }],
    })
    expect(pensionPctAt(p, 45)).toEqual({ employeePct: 6, employerPct: 0 })
  })

  it('holds the last step to the end', () => {
    const p = person({ pensionSchedule: [{ id: 'a', fromAge: 45, amount: 2 }] })
    expect(pensionPctAt(p, 90).employeePct + pensionPctAt(p, 90).employerPct).toBeCloseTo(2, 6)
  })

  it('does not care what order the steps are stored in', () => {
    const p = person({
      pensionSchedule: [
        { id: 'b', fromAge: 52, amount: 10 },
        { id: 'a', fromAge: 45, amount: 0 },
      ],
    })
    expect(pensionPctAt(p, 45).employeePct).toBe(0)
    expect(pensionPctAt(p, 52).employeePct + pensionPctAt(p, 52).employerPct).toBeCloseTo(10, 6)
  })

  it('pays nothing into a salary-based scheme whatever is scheduled', () => {
    const db = person({ pensionType: 'db', pensionSchedule: [{ id: 'a', fromAge: 45, amount: 20 }] })
    expect(annualPensionContribution(db, 50000, 45)).toBe(0)
  })
})

describe('what the contribution is worth each year', () => {
  it('is the combined percentage of salary', () => {
    expect(annualPensionContribution(person(), 50000, 40)).toBeCloseTo(4000, 6)
  })

  it('drops to nothing in a paused year', () => {
    const p = person({ pensionSchedule: [{ id: 'a', fromAge: 45, amount: 0 }] })
    expect(annualPensionContribution(p, 50000, 45)).toBe(0)
  })
})

describe('a career break through a whole projection', () => {
  function plan(schedule: Person['pensionSchedule']): Assumptions {
    return coerceAssumptions({
      ...base,
      people: [
        person({
          lifeExpectancy: 70,
          currentPensionPot: 0,
          pensionGrowthRate: base.inflationRate, // no real growth, so sums are exact
          salaryGrowthRate: base.inflationRate, // flat salary in today's money
          takeHomePay: 0,
          pensionSchedule: schedule,
        }),
      ],
      pots: [],
      properties: [],
      spendingChanges: [],
      oneOffEvents: [],
    })
  }

  const flat = plan([])
  const paused = plan([
    { id: 'a', fromAge: 45, amount: 0 },
    { id: 'b', fromAge: 50, amount: 8 },
  ])
  const potAt = (a: Assumptions, age: number) => {
    const row = simulate(a).find((r) => r.age === age)
    if (!row) throw new Error(`no row at ${age}`)
    return row.people[0].pensionPot
  }

  it('pays in every working year when nothing is scheduled', () => {
    // 20 years from 40 to 59 at £4,000.
    expect(potAt(flat, 59)).toBeCloseTo(20 * 4000, 0)
  })

  it('skips exactly the years the schedule pauses', () => {
    // 45-49 inclusive is five years of £4,000 not paid in.
    expect(potAt(paused, 59)).toBeCloseTo(20 * 4000 - 5 * 4000, 0)
  })

  it('leaves more pay in hand during the break', () => {
    const working = (a: Assumptions, age: number) => {
      const row = simulate(a).find((r) => r.age === age)
      if (!row) throw new Error(`no row at ${age}`)
      return row.people[0].takeHome
    }
    expect(working(paused, 46)).toBeGreaterThan(working(flat, 46))
    // ...and the same once contributions resume.
    expect(working(paused, 55)).toBeCloseTo(working(flat, 55), 2)
  })

  it('takes less home while contributing than not', () => {
    const p = person({ pensionSchedule: [{ id: 'a', fromAge: 45, amount: 0 }] })
    expect(takeHomeBase(p, base.tax, 45)).toBeGreaterThan(takeHomeBase(p, base.tax, 44))
  })

  it('reports the employee share for the take-home estimate', () => {
    const p = person({ pensionSchedule: [{ id: 'a', fromAge: 45, amount: 4 }] })
    expect(contributionPctFor(p, 44)).toBe(5)
    expect(contributionPctFor(p, 45)).toBeCloseTo(2.5, 6)
  })
})

describe('the year grid over a pension', () => {
  const p = person()
  const years = () =>
    scheduleYears(8, p.pensionSchedule, p.currentAge, p.retirementAge, p.retirementAge)

  it('runs from today to retirement', () => {
    expect(years()[0].age).toBe(40)
    expect(years()[years().length - 1].age).toBe(59)
  })

  it('starts with every year paying the headline rate', () => {
    expect(years().every((y) => y.paying && y.amount === 8)).toBe(true)
  })

  it('switches one year off with two steps, same as a pot', () => {
    const r = toggleContributionYear(years(), 45, 8, [])
    expect(r.steps.map((s) => [s.fromAge, s.amount])).toEqual([
      [45, 0],
      [46, 8],
    ])
  })

  it('refuses a pattern it cannot store', () => {
    // Alternate years is the case the cap exists for, and it needs a long
    // window to reach: twenty years can only ever need twenty steps.
    const LATE = 80
    let steps = p.pensionSchedule
    let refused: string | undefined
    for (let age = 41; age < LATE; age += 2) {
      const ys = scheduleYears(8, steps, 40, LATE, LATE)
      const res = toggleContributionYear(ys, age, 8, steps)
      if (res.refused) {
        refused = res.refused
        break
      }
      steps = res.steps
    }
    expect(refused).toBeDefined()
    expect(steps.length).toBeLessThanOrEqual(MAX_CONTRIBUTION_STEPS)
  })
})

describe('plans saved before pension schedules existed', () => {
  it('get an empty one and behave exactly as before', () => {
    const legacy = coerceAssumptions({
      ...base,
      people: [{ ...base.people[0], pensionSchedule: undefined }],
    })
    expect(legacy.people[0].pensionSchedule).toEqual([])
    expect(pensionPctAt(legacy.people[0], 50)).toEqual({
      employeePct: legacy.people[0].employeePensionPct,
      employerPct: legacy.people[0].employerPensionPct,
    })
  })

  it('cap an imported schedule like any other', () => {
    const flooded = coerceAssumptions({
      ...base,
      people: [
        {
          ...base.people[0],
          pensionSchedule: Array.from({ length: 500 }, (_, i) => ({ fromAge: i, amount: 1 })),
        },
      ],
    })
    expect(flooded.people[0].pensionSchedule).toHaveLength(MAX_CONTRIBUTION_STEPS)
  })

  it('refuse a negative percentage', () => {
    const negative = coerceAssumptions({
      ...base,
      people: [
        { ...base.people[0], pensionSchedule: [{ fromAge: 50, amount: -20 }] },
      ],
    })
    expect(negative.people[0].pensionSchedule[0].amount).toBe(0)
  })
})
