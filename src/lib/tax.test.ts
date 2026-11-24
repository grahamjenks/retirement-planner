import { describe, expect, it } from 'vitest'
import {
  allowanceFor,
  capitalGainsTax,
  defaultTaxSettings,
  estimateTakeHome,
  gainOnDisposal,
  grossUpPension,
  grossUpTaxable,
  incomeTax,
  marginalTax,
  nationalInsurance,
  netFromPensionGross,
  netFromTaxableGross,
  taxFreePart,
} from './tax'

const t = defaultTaxSettings
const off = { ...t, enabled: false }

describe('the personal allowance', () => {
  it.each([
    [50000, 12570, 'is untouched below the taper threshold'],
    [110000, 7570, 'tapers by £1 for every £2 over it'],
    [125140, 0, 'is gone entirely by £125,140'],
    [200000, 0, 'and cannot go negative'],
  ])('at £%i is £%i — %s', (income, want) => {
    expect(allowanceFor(income, t)).toBe(want)
  })
})

describe('income tax', () => {
  it.each([
    [0, 0],
    [12570, 0], // exactly the allowance
    [20000, 1486], // 7,430 at 20%
    [50270, 7540], // fills the basic band exactly
    [60000, 11432], // 7,540 + 9,730 at 40%
    [100000, 27432], // the last pound before the taper bites
    [125140, 42516], // no allowance left, basic + higher bands full
    [150000, 53703], // 24,860 into the additional rate
  ])('on £%i is £%i', (income, want) => {
    expect(incomeTax(income, t)).toBeCloseTo(want, 2)
  })

  it('is nothing on a negative income', () => {
    expect(incomeTax(-5000, t)).toBe(0)
  })

  it('is nothing at all when tax modelling is switched off', () => {
    expect(incomeTax(150000, off)).toBe(0)
  })
})

describe('marginal tax', () => {
  it('charges the band the addition actually lands in', () => {
    expect(marginalTax(12570, 10000, t)).toBeCloseTo(2000, 2)
  })

  it('splits an addition that straddles a band boundary', () => {
    // £45,000 leaves £5,270 of basic band; the other £4,730 is at 40%.
    expect(marginalTax(45000, 10000, t)).toBeCloseTo(5270 * 0.2 + 4730 * 0.4, 2)
  })

  it('is nothing for a non-positive addition', () => {
    expect(marginalTax(45000, 0, t)).toBe(0)
    expect(marginalTax(45000, -1000, t)).toBe(0)
  })
})

describe('the tax-free quarter of a pension withdrawal', () => {
  it('is 25% while the lump sum allowance lasts', () => {
    expect(taxFreePart(40000, t, Number.POSITIVE_INFINITY)).toBe(10000)
  })

  it('is limited by what is left of that allowance', () => {
    expect(taxFreePart(40000, t, 5000)).toBe(5000)
  })

  it('is nothing once the allowance is spent', () => {
    expect(taxFreePart(40000, t, 0)).toBe(0)
  })

  it('is the whole withdrawal when tax modelling is off', () => {
    expect(taxFreePart(40000, off, 0)).toBe(40000)
  })
})

describe('pension drawdown, gross to net and back', () => {
  it('taxes the three-quarters that is taxable', () => {
    // £40,000 gross: £10,000 tax-free, £30,000 taxable, which costs
    // £17,430 at 20% against a nil starting income.
    expect(netFromPensionGross(40000, 0, t)).toBeCloseTo(40000 - 17430 * 0.2, 2)
  })

  it('taxes the lot once the lump sum allowance is spent', () => {
    expect(netFromPensionGross(40000, 0, t, 0)).toBeCloseTo(40000 - 27430 * 0.2, 2)
  })

  it('leaves a withdrawal whole when tax modelling is off', () => {
    expect(netFromPensionGross(40000, 0, off)).toBe(40000)
  })

  it.each([1000, 12000, 40000, 90000, 200000])(
    'grosses £%i of spending back up to exactly what nets it',
    (net) => {
      const gross = grossUpPension(net, 0, t)
      expect(netFromPensionGross(gross, 0, t)).toBeCloseTo(net, 1)
      expect(gross).toBeGreaterThanOrEqual(net)
    },
  )

  it('grosses up correctly on top of income already being taxed', () => {
    const gross = grossUpPension(20000, 40000, t)
    expect(netFromPensionGross(gross, 40000, t)).toBeCloseTo(20000, 1)
  })

  it('needs no gross-up for nothing, or when tax is off', () => {
    expect(grossUpPension(0, 0, t)).toBe(0)
    expect(grossUpPension(20000, 0, off)).toBe(20000)
  })
})

describe('national insurance', () => {
  it.each([
    [10000, 0], // under the primary threshold
    [12570, 0], // exactly at it
    [20000, 594.4], // 7,430 at 8%
    [50270, 3016], // the whole main band
    [60000, 3210.6], // plus 9,730 at 2%
  ])('on £%i is £%i', (gross, want) => {
    expect(nationalInsurance(gross)).toBeCloseTo(want, 2)
  })
})

describe('take-home pay', () => {
  it('deducts the pension first, then tax and NI on what is left', () => {
    const r = estimateTakeHome(50000, 5, t)
    expect(r.pensionContribution).toBe(2500)
    expect(r.incomeTax).toBeCloseTo(34930 * 0.2, 2)
    expect(r.nationalInsurance).toBeCloseTo(34930 * 0.08, 2)
    expect(r.takeHome).toBeCloseTo(47500 - 6986 - 2794.4, 2)
  })

  it('deducts only the pension when tax modelling is off', () => {
    const r = estimateTakeHome(50000, 5, off)
    expect(r.incomeTax).toBe(0)
    expect(r.nationalInsurance).toBe(0)
    expect(r.takeHome).toBe(47500)
  })

  it('treats a negative salary or contribution as zero', () => {
    expect(estimateTakeHome(-1000, 5, t).takeHome).toBe(0)
    expect(estimateTakeHome(50000, -5, t).pensionContribution).toBe(0)
  })
})

describe('capital gains tax', () => {
  it.each([
    [2000, 0, 0, 'nothing below the exempt amount'],
    [3000, 0, 0, 'nothing at exactly the exempt amount'],
    [10000, 0, 1260, '£7,000 at 18% with no income in the way'],
    [10000, 30000, 1260, 'still all at 18% while basic-rate band is left'],
    [10000, 50270, 1680, 'all at 24% once income has filled the band'],
    [30000, 30000, 5263.8, '£20,270 at 18% then £6,730 at 24%'],
  ])('on a £%i gain against £%i of income is £%i — %s', (gain, income, want) => {
    expect(capitalGainsTax(gain, income, t)).toBeCloseTo(want, 2)
  })

  it('costs more to someone already earning well', () => {
    expect(capitalGainsTax(20000, 60000, t)).toBeGreaterThan(capitalGainsTax(20000, 0, t))
  })

  it('is nothing on a loss, or with tax modelling off', () => {
    expect(capitalGainsTax(-5000, 0, t)).toBe(0)
    expect(capitalGainsTax(50000, 0, off)).toBe(0)
  })
})

describe('the gain a disposal realises', () => {
  it('is the pot’s unrealised gain scaled by the share sold', () => {
    // £100,000 holding that cost £60,000: two fifths of whatever is sold.
    expect(gainOnDisposal(10000, 100000, 60000)).toBeCloseTo(4000, 6)
    expect(gainOnDisposal(50000, 100000, 60000)).toBeCloseTo(20000, 6)
  })

  it('is the whole gain when the whole pot goes', () => {
    expect(gainOnDisposal(100000, 100000, 60000)).toBeCloseTo(40000, 6)
  })

  it('cannot exceed the gain, however much is asked for', () => {
    expect(gainOnDisposal(999999, 100000, 60000)).toBeCloseTo(40000, 6)
  })

  it('is nothing on a pot worth no more than it cost', () => {
    expect(gainOnDisposal(10000, 100000, 100000)).toBe(0)
    expect(gainOnDisposal(10000, 100000, 120000)).toBe(0)
  })

  it('is nothing for an empty pot or an empty sale', () => {
    expect(gainOnDisposal(10000, 0, 0)).toBe(0)
    expect(gainOnDisposal(0, 100000, 60000)).toBe(0)
  })
})

describe('selling out of a taxable pot', () => {
  it('nets the disposal less the tax on the gain it realises', () => {
    // £10,000 out of £100,000 that cost £60,000 realises £4,000; £1,000 of
    // that is over the exempt amount, at 18%.
    expect(netFromTaxableGross(10000, 100000, 60000, 0, 0, t)).toBeCloseTo(10000 - 180, 2)
  })

  it('charges the full gain once the exempt amount is already spent', () => {
    expect(netFromTaxableGross(10000, 100000, 60000, 3000, 0, t)).toBeCloseTo(10000 - 720, 2)
  })

  it('nets the lot from a pot with no gain in it', () => {
    expect(netFromTaxableGross(10000, 100000, 100000, 0, 0, t)).toBe(10000)
  })

  it('nets the lot with tax modelling off', () => {
    expect(netFromTaxableGross(10000, 100000, 60000, 0, 0, off)).toBe(10000)
  })

  it.each([1000, 5000, 20000, 60000])(
    'grosses £%i of spending up to exactly what nets it',
    (net) => {
      const gross = grossUpTaxable(net, 200000, 80000, 0, 0, t)
      expect(netFromTaxableGross(gross, 200000, 80000, 0, 0, t)).toBeCloseTo(net, 1)
      expect(gross).toBeGreaterThanOrEqual(net)
    },
  )

  it('needs no gross-up when there is no gain to tax', () => {
    expect(grossUpTaxable(10000, 100000, 100000, 0, 0, t)).toBeCloseTo(10000, 6)
  })

  it('has to sell more when the owner has income filling the band', () => {
    const poor = grossUpTaxable(20000, 200000, 80000, 0, 0, t)
    const rich = grossUpTaxable(20000, 200000, 80000, 0, 60000, t)
    expect(rich).toBeGreaterThan(poor)
  })

  it('needs no gross-up for nothing, or with tax off', () => {
    expect(grossUpTaxable(0, 200000, 80000, 0, 0, t)).toBe(0)
    expect(grossUpTaxable(10000, 200000, 80000, 0, 0, off)).toBe(10000)
  })
})
