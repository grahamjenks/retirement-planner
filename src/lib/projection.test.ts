import { describe, expect, it } from 'vitest'
import {
  coerceAssumptions,
  defaultAssumptions,
  makeProperty,
  newId,
  potPresets,
} from './storage'
import { potContributionAt, simulate } from './projection'
import type { Assumptions, SavingsPot } from './types'

const base = defaultAssumptions

function preset(startsWith: string): SavingsPot {
  const found = potPresets.find((p) => p.label.startsWith(startsWith))
  if (!found) throw new Error(`no preset labelled ${startsWith}`)
  return { ...found.defaults, id: 'p', ownerId: base.people[0].id } as SavingsPot
}

/** The first year of retirement, where drawdown starts. */
function firstDrawYear(a: Assumptions) {
  const row = simulate(a).find((r) => r.householdRetired)
  if (!row) throw new Error('plan never retires')
  return row
}

describe('pension relief on the way in', () => {
  const sipp: SavingsPot = { ...preset('SIPP'), id: 'sipp', balance: 0, annualContribution: 8000 }

  it('is a pension pot, not a savings pot', () => {
    expect(sipp.kind).toBe('pension')
  })

  it('turns £8,000 of taxed income into £10,000 in the pot', () => {
    expect(potContributionAt(sipp, 40, false, 60)).toBe(10000)
  })
})

describe('pension tax on the way out', () => {
  // One person, no state pension, no other income and nothing but a SIPP, so
  // every pound of spending has to come through the pension tax rules.
  const sippOnly: Assumptions = coerceAssumptions({
    ...base,
    people: [
      {
        ...base.people[0],
        currentAge: 59,
        retirementAge: 60,
        lifeExpectancy: 62,
        currentPensionPot: 0,
        employeePensionPct: 0,
        employerPensionPct: 0,
        statePensionAge: 99,
        statePensionAnnual: 0,
      },
    ],
    pots: [{ ...preset('SIPP'), id: 'sipp', balance: 300000, annualContribution: 0, accessibleFromAge: 57 }],
    properties: [],
    spendingChanges: [],
    oneOffEvents: [],
    retirementMonthly: 1000,
    retirementAnnualExtras: 0,
    tax: { ...base.tax, enabled: true },
  })

  it('funds the spending in full', () => {
    expect(firstDrawYear(sippOnly).shortfall).toBeCloseTo(0, 1)
  })

  it('charges nothing while the taxable part is under the allowance', () => {
    // £12,000 a year: a quarter is tax-free and the rest is below the personal
    // allowance, so gross should equal net.
    const row = firstDrawYear(sippOnly)
    expect(row.taxPaid).toBeCloseTo(0, 1)
    expect(row.withdrawal).toBeCloseTo(12000, 0)
  })

  const bigSpend = coerceAssumptions({ ...sippOnly, retirementMonthly: 4000 })

  it('grosses the withdrawal up once spending clears the allowance', () => {
    const row = firstDrawYear(bigSpend)
    expect(row.withdrawal).toBeGreaterThan(48000)
    expect(row.taxPaid).toBeGreaterThan(0)
  })

  it('costs nothing extra when the same money sits in an ISA', () => {
    const isa = coerceAssumptions({
      ...bigSpend,
      pots: [{ ...bigSpend.pots[0], kind: 'savings', accessibleFromAge: 0 }],
    })
    const row = firstDrawYear(isa)
    expect(row.withdrawal).toBeCloseTo(48000, 0)
    expect(row.taxPaid).toBeCloseTo(0, 1)
  })

  it('makes the pension dearer than the ISA for identical spending', () => {
    const isa = coerceAssumptions({
      ...bigSpend,
      pots: [{ ...bigSpend.pots[0], kind: 'savings', accessibleFromAge: 0 }],
    })
    expect(firstDrawYear(bigSpend).withdrawal).toBeGreaterThan(firstDrawYear(isa).withdrawal)
  })
})

describe('property', () => {
  const withHouse: Assumptions = coerceAssumptions({
    ...base,
    people: [{ ...base.people[0], currentAge: 60, retirementAge: 61, lifeExpectancy: 70 }],
    pots: [{ ...base.pots[0], id: 'cash', balance: 0, annualContribution: 0, accessibleFromAge: 0 }],
    properties: [
      makeProperty({
        id: 'home',
        ownerId: base.people[0].id,
        value: 400000,
        growthRate: 2.5,
        mortgageBalance: 100000,
        mortgageAnnualPayment: 10000,
        mortgageYearsRemaining: 5,
        sellAtAge: 65,
        replacementValue: 250000,
        sellingCostsPct: 3,
        proceedsTargetId: 'cash',
      }),
    ],
    spendingChanges: [],
    oneOffEvents: [],
  })
  const rows = simulate(withHouse)
  const saleIndex = rows.findIndex((r) => r.propertyReleased > 0)
  const saleRow = rows[saleIndex]

  it('holds its value in real terms when growth matches inflation', () => {
    expect(rows[0].propertyValues[0]).toBeCloseTo(400000, -3)
  })

  it('pays the mortgage down over its term and no further', () => {
    expect(rows[4].propertyMortgages[0]).toBeCloseTo(0, 0)
    expect(rows[6].propertyMortgages[0]).toBeCloseTo(0, 1)
  })

  it('sells at the age given', () => {
    expect(saleRow.age).toBe(65)
  })

  it('releases the proceeds of downsizing, net of selling costs', () => {
    // £400,000 less 3% is £388,000; the mortgage is long cleared; the
    // replacement costs £250,000.
    expect(saleRow.propertyReleased).toBeCloseTo(138000, -3)
    expect(saleRow.propertyValues[0]).toBeCloseTo(250000, -3)
    expect(saleRow.propertyEquityTotal).toBeCloseTo(250000, -3)
  })

  it('keeps the equity out of reach until the sale', () => {
    expect(rows[saleIndex - 1].propertyReleased).toBe(0)
  })

  it('counts towards net worth but not the drawable pot', () => {
    expect(rows[0].netWorth).toBeGreaterThan(rows[0].totalPot)
  })

  it('releases nothing at all when the house is kept', () => {
    const kept = coerceAssumptions({
      ...withHouse,
      properties: [{ ...withHouse.properties[0], sellAtAge: null }],
    })
    expect(simulate(kept).some((r) => r.propertyReleased > 0)).toBe(false)
  })
})

describe('the household mortgage fields that properties replaced', () => {
  const legacy = coerceAssumptions({
    ...base,
    properties: undefined,
    mortgageAnnualPayment: 12000,
    mortgageYearsRemaining: 15,
  })

  it('migrates onto a property', () => {
    expect(legacy.properties).toHaveLength(1)
    expect(legacy.properties[0].mortgageAnnualPayment).toBe(12000)
    expect(legacy.properties[0].mortgageYearsRemaining).toBe(15)
  })

  it('still charges the payment for the rest of the term', () => {
    const rows = simulate(legacy)
    expect(rows[0].mortgagePayment).toBe(12000)
    expect(rows[15].mortgagePayment).toBe(0)
  })
})

describe('collection caps on an imported plan', () => {
  // Without these, a crafted backup makes every later visit unusable: the
  // oversized plan is written to localStorage before the expensive render.
  const flood = coerceAssumptions({
    ...base,
    people: Array.from({ length: 500 }, (_, i) => ({ ...base.people[0], id: 'p' + i })),
    pots: Array.from({ length: 500 }, (_, i) => ({ ...base.pots[0], id: 'q' + i })),
    properties: Array.from({ length: 500 }, () => makeProperty({ id: newId() })),
    spendingChanges: Array.from({ length: 500 }, () => ({ fromAge: 70, amount: 1 })),
    oneOffEvents: Array.from({ length: 500 }, () => ({ atAge: 70, amount: 1, targetId: 'x' })),
  })

  it.each([
    ['people', flood.people.length, 10],
    ['pots', flood.pots.length, 20],
    ['properties', flood.properties.length, 20],
    ['spending changes', flood.spendingChanges.length, 50],
    ['one-off events', flood.oneOffEvents.length, 50],
  ])('caps %s at %i', (_label, got, want) => {
    expect(got).toBe(want)
  })

  it('cuts an absurdly long name down to size', () => {
    const long = coerceAssumptions({
      ...base,
      people: [{ ...base.people[0], name: 'x'.repeat(10000) }],
    })
    expect(long.people[0].name).toHaveLength(60)
  })
})
