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

describe('a general investment account', () => {
  const giaPreset = potPresets.find((p) => p.label.startsWith('General investment'))
  if (!giaPreset) throw new Error('no GIA preset')

  it('is modelled as taxable, as its description says', () => {
    expect(giaPreset.defaults.kind).toBe('taxable')
  })

  it('is no longer identical to the Stocks & Shares ISA', () => {
    const isaPreset = potPresets.find((p) => p.label.startsWith('Stocks'))
    if (!isaPreset) throw new Error('no ISA preset')
    expect(giaPreset.defaults.kind).not.toBe(isaPreset.defaults.kind)
  })

  /**
   * One person, no state pension and nothing but this pot, so every pound of
   * spending comes through it and the arithmetic stays checkable. Growth is
   * set to inflation so the balance holds in real terms.
   */
  function onePot(kind: 'savings' | 'taxable', over: Partial<SavingsPot> = {}): Assumptions {
    return coerceAssumptions({
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
      pots: [
        {
          ...base.pots[0],
          id: 'gia',
          kind,
          balance: 300000,
          costBasis: 100000,
          annualContribution: 0,
          growthRate: base.inflationRate,
          accessibleFromAge: 0,
          ...over,
        },
      ],
      properties: [],
      spendingChanges: [],
      oneOffEvents: [],
      retirementMonthly: 1000,
      retirementAnnualExtras: 0,
      tax: { ...base.tax, enabled: true },
    })
  }

  describe('with a £200,000 gain on a £300,000 balance', () => {
    // Two thirds of anything sold is gain. To net £12,000 of spending:
    //   g − 0.18 × (⅔g − 3,000) = 12,000  →  0.88g = 11,460  →  g = 13,022.73
    const row = firstDrawYear(onePot('taxable'))

    it('sells more than is spent, to cover the tax on the gain', () => {
      expect(row.withdrawal).toBeCloseTo(13022.73, 1)
    })

    it('realises two thirds of what it sells as gain', () => {
      expect(row.realisedGains).toBeCloseTo(13022.73 * (2 / 3), 1)
    })

    it('charges 18% on the gain above the exempt amount', () => {
      expect(row.capitalGainsTax).toBeCloseTo(1022.73, 1)
    })

    it('counts that charge in the household tax total', () => {
      expect(row.taxPaid).toBeCloseTo(row.capitalGainsTax, 2)
    })

    it('still funds the spending in full', () => {
      expect(row.shortfall).toBeCloseTo(0, 1)
    })
  })

  it('costs more than the identical money in an ISA', () => {
    const isa = firstDrawYear(onePot('savings'))
    expect(isa.withdrawal).toBeCloseTo(12000, 1)
    expect(isa.capitalGainsTax).toBe(0)
    expect(firstDrawYear(onePot('taxable')).withdrawal).toBeGreaterThan(isa.withdrawal)
  })

  it('charges nothing while the gain stays inside the exempt amount', () => {
    // A £3,000 gain on a £300,000 pot means only 1% of a sale is gain, so
    // £12,000 of spending realises £120 — well under £3,000.
    const row = firstDrawYear(onePot('taxable', { costBasis: 297000 }))
    expect(row.capitalGainsTax).toBe(0)
    expect(row.withdrawal).toBeCloseTo(12000, 1)
  })

  it('charges nothing on a pot worth less than it cost', () => {
    const row = firstDrawYear(onePot('taxable', { costBasis: 400000 }))
    expect(row.realisedGains).toBe(0)
    expect(row.capitalGainsTax).toBe(0)
    expect(row.withdrawal).toBeCloseTo(12000, 1)
  })

  it('charges nothing at all with tax modelling switched off', () => {
    const plan = coerceAssumptions({ ...onePot('taxable'), tax: { ...base.tax, enabled: false } })
    const row = firstDrawYear(plan)
    expect(row.capitalGainsTax).toBe(0)
    expect(row.withdrawal).toBeCloseTo(12000, 1)
  })

  it('leaves the gain to grow while nothing is sold', () => {
    const rows = simulate(onePot('taxable'))
    const working = rows.filter((r) => !r.householdRetired)
    expect(working.length).toBeGreaterThan(0)
    expect(working.every((r) => r.capitalGainsTax === 0 && r.realisedGains === 0)).toBe(true)
  })

  it('costs an already well-paid owner more for the same spending', () => {
    const earning = coerceAssumptions({
      ...onePot('taxable'),
      people: [
        {
          ...base.people[0],
          currentAge: 59,
          retirementAge: 60,
          lifeExpectancy: 62,
          currentPensionPot: 0,
          employeePensionPct: 0,
          employerPensionPct: 0,
          statePensionAge: 60,
          statePensionAnnual: 60000, // enough to fill the basic-rate band
        },
      ],
      retirementMonthly: 6000,
    })
    const modest = coerceAssumptions({ ...onePot('taxable'), retirementMonthly: 6000 })
    const perGain = (a: Assumptions) => {
      const row = firstDrawYear(a)
      return row.capitalGainsTax / row.realisedGains
    }
    expect(perGain(earning)).toBeGreaterThan(perGain(modest))
  })
})

describe('what adds to a taxable pot’s base cost', () => {
  function plan(over: Record<string, unknown> = {}): Assumptions {
    return coerceAssumptions({
      ...base,
      people: [{ ...base.people[0], currentAge: 40, retirementAge: 60, lifeExpectancy: 62 }],
      pots: [
        {
          ...base.pots[0],
          id: 'gia',
          kind: 'taxable',
          balance: 100000,
          costBasis: 100000,
          annualContribution: 10000,
          growthRate: base.inflationRate, // no real growth, so no new gain
          accessibleFromAge: 0,
          contributionEndsAtRetirement: true,
        },
      ],
      properties: [],
      spendingChanges: [],
      oneOffEvents: [],
      retirementMonthly: 1000,
      retirementAnnualExtras: 0,
      tax: { ...base.tax, enabled: true },
      ...over,
    })
  }

  it('counts contributions, so paying in creates no gain to tax', () => {
    const row = firstDrawYear(plan())
    expect(row.realisedGains).toBe(0)
    expect(row.capitalGainsTax).toBe(0)
  })

  it('counts a one-off payment in', () => {
    const row = firstDrawYear(
      plan({ oneOffEvents: [{ atAge: 45, amount: 50000, targetId: 'gia' }] }),
    )
    expect(row.realisedGains).toBe(0)
  })

  it('counts property sale proceeds landing in it', () => {
    const withHouse = plan({
      properties: [
        makeProperty({
          id: 'home',
          ownerId: base.people[0].id,
          value: 300000,
          growthRate: base.inflationRate,
          mortgageBalance: 0,
          mortgageAnnualPayment: 0,
          mortgageYearsRemaining: 0,
          sellAtAge: 50,
          replacementValue: 100000,
          sellingCostsPct: 0,
          proceedsTargetId: 'gia',
        }),
      ],
    })
    const rows = simulate(withHouse)
    const sale = rows.find((r) => r.propertyReleased > 0)
    expect(sale?.propertyReleased).toBeCloseTo(200000, -2)
    // The proceeds arrive as cost, not gain, so drawing on them later is not
    // taxed as though the whole lot were profit.
    expect(firstDrawYear(withHouse).realisedGains).toBe(0)
  })

  it('does not count growth — that is exactly what gets taxed', () => {
    const growing = plan({
      pots: [
        {
          ...base.pots[0],
          id: 'gia',
          kind: 'taxable',
          balance: 100000,
          costBasis: 100000,
          annualContribution: 0,
          growthRate: base.inflationRate + 5, // 5% real
          accessibleFromAge: 0,
        },
      ],
    })
    const row = firstDrawYear(growing)
    expect(row.realisedGains).toBeGreaterThan(0)
    expect(row.capitalGainsTax).toBeGreaterThan(0)
  })
})

describe('taking money out of a taxable pot as a one-off', () => {
  // The one-off runs before the year's income is known, so the charge has to
  // be settled up afterwards rather than at the point of sale.
  const withdrawal: Assumptions = coerceAssumptions({
    ...base,
    people: [{ ...base.people[0], currentAge: 40, retirementAge: 60, lifeExpectancy: 62 }],
    pots: [
      {
        ...base.pots[0],
        id: 'gia',
        kind: 'taxable',
        balance: 300000,
        costBasis: 100000,
        annualContribution: 0,
        growthRate: base.inflationRate,
        accessibleFromAge: 0,
      },
    ],
    properties: [],
    spendingChanges: [],
    oneOffEvents: [{ atAge: 42, amount: -60000, targetId: 'gia' }],
    tax: { ...base.tax, enabled: true },
  })
  const row = simulate(withdrawal).find((r) => r.age === 42)
  if (!row) throw new Error('no row at 42')

  it('realises the gain on what it takes', () => {
    expect(row.realisedGains).toBeCloseTo(40000, 0) // two thirds of £60,000
  })

  it('charges it, once the year’s income is known', () => {
    // £37,000 over the exempt amount, against a salary that has already
    // filled some of the basic-rate band.
    expect(row.capitalGainsTax).toBeGreaterThan(0)
    expect(row.taxPaid).toBeGreaterThanOrEqual(row.capitalGainsTax)
  })
})

describe('plans saved before taxable pots existed', () => {
  it('assume the balance is all cost, so nothing is suddenly taxed', () => {
    const legacy = coerceAssumptions({
      ...base,
      pots: [{ ...base.pots[0], balance: 250000, costBasis: undefined }],
    })
    expect(legacy.pots[0].costBasis).toBe(250000)
  })

  it('stay savings pots unless they say otherwise', () => {
    const legacy = coerceAssumptions({
      ...base,
      pots: [{ ...base.pots[0], kind: undefined }],
    })
    expect(legacy.pots[0].kind).toBe('savings')
  })

  it('reject a kind that is not one of the three', () => {
    const odd = coerceAssumptions({
      ...base,
      pots: [{ ...base.pots[0], kind: 'offshore-trust' }],
    })
    expect(odd.pots[0].kind).toBe('savings')
  })
})

describe('a general investment account added before it was taxable', () => {
  // It was stored as an ordinary savings pot, because the preset was
  // identical to the ISA one.
  const legacyGia = () =>
    coerceAssumptions({
      ...base,
      people: [{ ...base.people[0], currentAge: 59, retirementAge: 60, lifeExpectancy: 62 }],
      pots: [
        {
          ...base.pots[0],
          id: 'gia',
          name: 'General investment account',
          kind: 'savings',
          balance: 300000,
          annualContribution: 0,
          growthRate: base.inflationRate, // no real growth, so no new gain
          accessibleFromAge: 0,
        },
      ],
      properties: [],
      spendingChanges: [],
      oneOffEvents: [],
      retirementMonthly: 1000,
      retirementAnnualExtras: 0,
      tax: { ...base.tax, enabled: true },
    })

  it('is moved across to the taxable kind on load', () => {
    expect(legacyGia().pots[0].kind).toBe('taxable')
  })

  it('arrives with its base cost set to its balance', () => {
    expect(legacyGia().pots[0].costBasis).toBe(300000)
  })

  it('so the projection does not change until someone says what they paid', () => {
    const row = firstDrawYear(legacyGia())
    expect(row.realisedGains).toBe(0)
    expect(row.capitalGainsTax).toBe(0)
    expect(row.withdrawal).toBeCloseTo(12000, 1)
  })

  it('rather than treating the whole balance as profit', () => {
    // What would happen if the promotion left the base cost at the 0 that
    // every non-taxable pot carries: £12,000 of spending would realise
    // £12,000 of gain and be charged for most of it.
    const asAllGain = coerceAssumptions({
      ...legacyGia(),
      pots: [{ ...legacyGia().pots[0], kind: 'taxable', costBasis: 0 }],
    })
    expect(firstDrawYear(asAllGain).capitalGainsTax).toBeGreaterThan(1000)
    expect(firstDrawYear(legacyGia()).capitalGainsTax).toBe(0)
  })

  it('leaves a pot the owner renamed alone', () => {
    const renamed = coerceAssumptions({
      ...base,
      pots: [{ ...base.pots[0], name: 'My investments', kind: 'savings' }],
    })
    expect(renamed.pots[0].kind).toBe('savings')
  })

  it('does not override a kind that was recorded', () => {
    const explicit = coerceAssumptions({
      ...base,
      pots: [{ ...base.pots[0], name: 'General investment account', kind: 'pension' }],
    })
    expect(explicit.pots[0].kind).toBe('pension')
  })
})
