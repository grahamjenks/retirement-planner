import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMonthly,
  ownedLabel,
  personAge,
} from './format'

describe('ownedLabel', () => {
  it('names the owner when there is someone else it could belong to', () => {
    expect(ownedLabel('pension', 'Sam', 2)).toBe('Sam: pension')
  })

  it('drops the name when there is nobody to tell apart', () => {
    expect(ownedLabel('pension', 'Sam', 1)).toBe('Pension')
  })

  it('drops the default name a plan nobody has edited still carries', () => {
    // The whole point: a new plan calls its one person "Me".
    expect(ownedLabel('pension', 'Me', 1)).toBe('Pension')
    expect(ownedLabel('take-home', 'Me', 1)).toBe('Take-home')
  })

  it('leaves an already-capitalised label alone', () => {
    expect(ownedLabel('Pension', 'Me', 1)).toBe('Pension')
  })

  it('copes with an empty label', () => {
    expect(ownedLabel('', 'Me', 1)).toBe('')
  })
})

describe('currency formatting', () => {
  it('rounds to whole pounds', () => {
    expect(formatCurrency(1234.56)).toBe('£1,235')
  })

  it('shows a monthly figure from an annual one', () => {
    expect(formatMonthly(12000)).toBe('£1,000')
  })

  it('compacts large figures', () => {
    expect(formatCurrencyCompact(1500000)).toBe('£1.5m')
  })
})

describe('personAge', () => {
  it('names the person when there is a list to tell apart', () => {
    expect(personAge('Sam', 64, 2)).toBe('Sam 64')
  })

  it('gives the bare age when there is only one', () => {
    expect(personAge('Me', 64, 1)).toBe('64')
  })
})
