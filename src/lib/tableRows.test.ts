import { describe, expect, it } from 'vitest'
import { coerceAssumptions, defaultAssumptions, makePerson } from './storage'
import { simulate } from './projection'
import { eventNoteFor, milestoneYears, selectRows } from './tableRows'
import type { Assumptions } from './types'

const base = defaultAssumptions

function plan(over: Record<string, unknown> = {}): Assumptions {
  return coerceAssumptions({
    ...base,
    people: [{ ...base.people[0], currentAge: 40, retirementAge: 60, lifeExpectancy: 75 }],
    pots: [],
    properties: [],
    spendingChanges: [],
    oneOffEvents: [],
    ...over,
  })
}

/** Every note the table would print, keyed by the age it prints at. */
function notesByAge(a: Assumptions): Map<number, string> {
  const out = new Map<number, string>()
  simulate(a).forEach((row) => {
    const note = eventNoteFor(a, row)
    if (note) out.set(row.age, note)
  })
  return out
}

describe('event notes on a one-person plan', () => {
  const notes = notesByAge(plan())

  it('does not name the only person in the household', () => {
    for (const note of notes.values()) expect(note).not.toMatch(/\bMe\b/)
  })

  it('says what happens, not who it happens to', () => {
    expect(notes.get(60)).toBe('Retires')
    expect(notes.get(67)).toBe('State pension')
    expect(notes.get(57)).toBe('Pension unlocks')
  })
})

describe('event notes with a partner', () => {
  const two = plan({
    people: [
      { ...base.people[0], id: 'me', name: 'Sam', currentAge: 40, retirementAge: 60 },
      { ...makePerson(), id: 'you', name: 'Alex', currentAge: 40, retirementAge: 62 },
    ],
  })
  const notes = notesByAge(two)

  it('names whose event it is', () => {
    expect(notes.get(60)).toBe('Sam retires')
    expect(notes.get(62)).toBe('Alex retires')
  })

  it('joins events landing in the same year', () => {
    const same = plan({
      people: [
        { ...base.people[0], id: 'me', name: 'Sam', currentAge: 40, retirementAge: 60 },
        { ...makePerson(), id: 'you', name: 'Alex', currentAge: 40, retirementAge: 60 },
      ],
    })
    expect(notesByAge(same).get(60)).toBe('Sam retires · Alex retires')
  })
})

describe('pot and one-off notes', () => {
  it('notes a pot unlocking', () => {
    const withLocked = plan({
      pots: [{ ...base.pots[0], id: 'lisa', name: 'Lifetime ISA', accessibleFromAge: 60 }],
    })
    expect(notesByAge(withLocked).get(60)).toContain('Lifetime ISA unlocks')
  })

  it('does not note a pot that was already unlocked at the start', () => {
    const open = plan({
      pots: [{ ...base.pots[0], id: 'isa', name: 'Cash ISA', accessibleFromAge: 0 }],
    })
    for (const note of notesByAge(open).values()) expect(note).not.toContain('Cash ISA unlocks')
  })

  it('notes a one-off by the name it was given', () => {
    const withEvent = plan({
      pots: [{ ...base.pots[0], id: 'isa', accessibleFromAge: 0 }],
      oneOffEvents: [{ atAge: 55, amount: 20000, targetId: 'isa', name: 'Inheritance' }],
    })
    expect(notesByAge(withEvent).get(55)).toContain('Inheritance')
  })

  it('returns null for a year where nothing happens', () => {
    const a = plan()
    const quiet = simulate(a).find((r) => r.age === 45)
    if (!quiet) throw new Error('no row at 45')
    expect(eventNoteFor(a, quiet)).toBeNull()
  })
})

describe('which rows the condensed table keeps', () => {
  const a = plan({ oneOffEvents: [{ atAge: 53, amount: 1000, targetId: 'x' }] })
  const rows = simulate(a)
  const milestones = milestoneYears(a, rows)
  const ageOf = (t: number) => a.people[0].currentAge + t

  it('keeps the first and last year', () => {
    expect(milestones.has(rows[0].t)).toBe(true)
    expect(milestones.has(rows[rows.length - 1].t)).toBe(true)
  })

  it.each([
    ['retirement', 60],
    ['the state pension', 67],
    ['the pension unlocking', 57],
    ['a one-off event', 53],
  ])('keeps %s', (_label, age) => {
    expect([...milestones].map(ageOf)).toContain(age)
  })

  it('otherwise keeps every fifth year', () => {
    const kept = selectRows(rows, false, milestones)
    const extras = kept.filter((r) => r.t % 5 !== 0).map((r) => r.age)
    // Nothing survives the filter but multiples of five and the milestones.
    for (const age of extras) expect([...milestones].map(ageOf)).toContain(age)
  })

  it('keeps everything when asked for every year', () => {
    expect(selectRows(rows, true, milestones)).toHaveLength(rows.length)
  })
})
