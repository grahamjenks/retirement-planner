import { describe, expect, it } from 'vitest'
import { condense, describeMoneySeries } from './chartSummary'

describe('condense', () => {
  it('leaves a short series alone', () => {
    expect(condense([1, 2])).toEqual([1, 2])
  })

  it('keeps every fifth point and both ends', () => {
    const rows = Array.from({ length: 12 }, (_, i) => i)
    expect(condense(rows)).toEqual([0, 5, 10, 11])
  })

  it('does not repeat the last point when it already lands on the step', () => {
    const rows = Array.from({ length: 11 }, (_, i) => i)
    expect(condense(rows)).toEqual([0, 5, 10])
  })

  it('takes a different step', () => {
    expect(condense([0, 1, 2, 3, 4, 5, 6], 3)).toEqual([0, 3, 6])
  })
})

describe('describeMoneySeries', () => {
  it('says where it starts, peaks and ends', () => {
    const s = describeMoneySeries(
      [
        { label: '2026', value: 100000 },
        { label: '2040', value: 500000 },
        { label: '2060', value: 20000 },
      ],
      'Total wealth',
    )
    expect(s).toBe(
      'Total wealth starts at £100,000 in 2026, peaks at £500,000 in 2040, and ends at £20,000 in 2060.',
    )
  })

  it('does not call the first point a peak', () => {
    const s = describeMoneySeries(
      [
        { label: '2026', value: 500000 },
        { label: '2060', value: 10000 },
      ],
      'Wealth',
    )
    expect(s).toBe('Wealth starts at £500,000 in 2026, and ends at £10,000 in 2060.')
  })

  it('does not call the last point a peak either', () => {
    const s = describeMoneySeries(
      [
        { label: '2026', value: 10000 },
        { label: '2060', value: 500000 },
      ],
      'Wealth',
    )
    expect(s).not.toContain('peaks')
  })

  it('copes with nothing to describe', () => {
    expect(describeMoneySeries([], 'Wealth')).toBe('No Wealth to show.')
  })
})
