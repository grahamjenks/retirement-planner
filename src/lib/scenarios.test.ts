import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activeScenario,
  addScenario,
  coerceStore,
  compareScenario,
  deleteActive,
  duplicateActive,
  loadStore,
  MAX_SCENARIOS,
  renameActive,
  setCompare,
  uniqueName,
} from './scenarios'
import { defaultAssumptions } from './storage'
import type { Assumptions } from './types'

const SCENARIO_KEY = 'retirement-planner:scenarios:v1'
const V3 = 'retirement-planner:assumptions:v3'
const V2 = 'retirement-planner:assumptions:v2'
const V1 = 'retirement-planner:assumptions:v1'

/**
 * A localStorage good enough for these modules, which only ever get, set and
 * remove. Cheaper than pulling in a whole DOM for three methods.
 */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  storage = fakeStorage()
  vi.stubGlobal('window', { localStorage: storage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const plan = (over: Partial<Assumptions> = {}): Assumptions => ({ ...defaultAssumptions, ...over })

describe('loadStore', () => {
  it('starts a first-time visitor on one default plan', () => {
    const store = loadStore()
    expect(store.scenarios).toHaveLength(1)
    expect(store.compareId).toBeNull()
    expect(activeScenario(store).name).toBe('My plan')
  })

  it('persists that store so the next visit reads it back', () => {
    loadStore()
    expect(storage.map.has(SCENARIO_KEY)).toBe(true)
  })

  it('carries a pre-scenarios v3 plan forward as the one scenario', () => {
    storage.map.set(V3, JSON.stringify(plan({ retirementMonthly: 4321 })))
    const store = loadStore()
    expect(store.scenarios).toHaveLength(1)
    expect(activeScenario(store).assumptions.retirementMonthly).toBe(4321)
  })

  it('migrates a v2 plan through to a scenario', () => {
    storage.map.set(V2, JSON.stringify({ currentAge: 44, targetRetirementAge: 58, pots: [] }))
    const person = activeScenario(loadStore()).assumptions.people[0]
    expect(person.currentAge).toBe(44)
    expect(person.retirementAge).toBe(58)
  })

  it('migrates a v1 plan, splitting its pension contribution in two', () => {
    storage.map.set(
      V1,
      JSON.stringify({
        currentAnnualIncome: 50000,
        annualPensionContribution: 5000,
        currentSavings: 25000,
        annualSavingsContribution: 2000,
      }),
    )
    const a = activeScenario(loadStore()).assumptions
    expect(a.people[0].employeePensionPct).toBe(5)
    expect(a.people[0].employerPensionPct).toBe(5)
    expect(a.pots[0].balance).toBe(25000)
    expect(a.pots[0].annualContribution).toBe(2000)
  })

  it('prefers the scenario store over any older key', () => {
    storage.map.set(V3, JSON.stringify(plan({ retirementMonthly: 1111 })))
    storage.map.set(
      SCENARIO_KEY,
      JSON.stringify({
        scenarios: [{ id: 'a', name: 'Kept', assumptions: plan({ retirementMonthly: 2222 }) }],
        activeId: 'a',
        compareId: null,
      }),
    )
    const store = loadStore()
    expect(activeScenario(store).name).toBe('Kept')
    expect(activeScenario(store).assumptions.retirementMonthly).toBe(2222)
  })

  it('falls back to a default store rather than throwing on corrupt JSON', () => {
    storage.map.set(SCENARIO_KEY, '{ this is not json')
    expect(loadStore().scenarios).toHaveLength(1)
  })

  it('survives storage being unavailable altogether', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('denied')
        },
        removeItem: () => {},
      },
    })
    expect(loadStore().scenarios).toHaveLength(1)
  })
})

describe('coerceStore', () => {
  const scenario = (id: string, name: string) => ({ id, name, assumptions: defaultAssumptions })

  it.each([
    ['a string', '"nope"'],
    ['an array', '[]'],
    ['null', 'null'],
  ])('returns a usable store for %s', (_label, json) => {
    expect(coerceStore(JSON.parse(json)).scenarios).toHaveLength(1)
  })

  it('returns a usable store when the scenarios list is empty', () => {
    expect(coerceStore({ scenarios: [], activeId: 'x', compareId: null }).scenarios).toHaveLength(1)
  })

  it('repairs an activeId that points at nothing', () => {
    const store = coerceStore({
      scenarios: [scenario('a', 'A'), scenario('b', 'B')],
      activeId: 'gone',
      compareId: null,
    })
    expect(store.activeId).toBe('a')
  })

  it('drops a compareId that points at nothing', () => {
    const store = coerceStore({
      scenarios: [scenario('a', 'A')],
      activeId: 'a',
      compareId: 'gone',
    })
    expect(store.compareId).toBeNull()
  })

  it('refuses to compare a plan with itself', () => {
    const store = coerceStore({
      scenarios: [scenario('a', 'A')],
      activeId: 'a',
      compareId: 'a',
    })
    expect(store.compareId).toBeNull()
  })

  it('makes duplicate ids distinct, so the pickers address one plan each', () => {
    const store = coerceStore({
      scenarios: [scenario('same', 'A'), scenario('same', 'B')],
      activeId: 'same',
      compareId: null,
    })
    expect(new Set(store.scenarios.map((s) => s.id)).size).toBe(2)
  })

  it('makes duplicate names distinct too', () => {
    const store = coerceStore({
      scenarios: [scenario('a', 'Plan'), scenario('b', 'Plan')],
      activeId: 'a',
      compareId: null,
    })
    expect(store.scenarios.map((s) => s.name)).toEqual(['Plan', 'Plan 2'])
  })

  it('names a scenario that has none', () => {
    const store = coerceStore({ scenarios: [{ assumptions: defaultAssumptions }] })
    expect(store.scenarios[0].name).toBe('Plan 1')
    expect(store.scenarios[0].id.length).toBeGreaterThan(0)
  })

  it('caps how many plans an imported store can carry', () => {
    const store = coerceStore({
      scenarios: Array.from({ length: 200 }, (_, i) => scenario('s' + i, 'Plan ' + i)),
      activeId: 's0',
      compareId: null,
    })
    expect(store.scenarios).toHaveLength(MAX_SCENARIOS)
  })

  it('coerces each scenario’s assumptions, caps and all', () => {
    const store = coerceStore({
      scenarios: [
        {
          id: 'a',
          name: 'A',
          assumptions: { ...defaultAssumptions, people: Array.from({ length: 99 }, () => ({})) },
        },
      ],
      activeId: 'a',
      compareId: null,
    })
    expect(store.scenarios[0].assumptions.people).toHaveLength(10)
  })
})

describe('uniqueName', () => {
  it('leaves a free name alone', () => {
    expect(uniqueName('Plan B', ['Plan A'])).toBe('Plan B')
  })

  it('counts up past the names already taken', () => {
    expect(uniqueName('Plan', ['Plan', 'Plan 2'])).toBe('Plan 3')
  })

  it('falls back for a blank name', () => {
    expect(uniqueName('   ', [])).toBe('Untitled plan')
  })

  it('cuts an over-long name down', () => {
    expect(uniqueName('x'.repeat(200), []).length).toBeLessThanOrEqual(40)
  })
})

describe('editing the set of plans', () => {
  const two = coerceStore({
    scenarios: [
      { id: 'a', name: 'A', assumptions: defaultAssumptions },
      { id: 'b', name: 'B', assumptions: defaultAssumptions },
    ],
    activeId: 'a',
    compareId: null,
  })

  it('points a duplicate at the plan it came from', () => {
    const next = duplicateActive(two)
    expect(next.scenarios).toHaveLength(3)
    expect(activeScenario(next).name).toBe('A copy')
    expect(next.compareId).toBe('a')
    expect(compareScenario(next)?.name).toBe('A')
  })

  it('refuses to add past the cap', () => {
    let store = two
    while (store.scenarios.length < MAX_SCENARIOS) {
      store = addScenario(store, 'Another', defaultAssumptions)
    }
    expect(addScenario(store, 'One too many', defaultAssumptions)).toBe(store)
  })

  it('refuses to delete the last plan', () => {
    const one = coerceStore({
      scenarios: [{ id: 'a', name: 'A', assumptions: defaultAssumptions }],
      activeId: 'a',
      compareId: null,
    })
    expect(deleteActive(one)).toBe(one)
  })

  it('clears a comparison pointing at a deleted plan', () => {
    const compared = setCompare(two, 'b')
    expect(compared.compareId).toBe('b')
    const after = deleteActive({ ...compared, activeId: 'b' })
    expect(after.compareId).toBeNull()
    expect(after.scenarios.map((s) => s.id)).toEqual(['a'])
  })

  it('keeps a rename from colliding with another plan', () => {
    expect(renameActive(two, 'B').scenarios[0].name).toBe('B 2')
  })

  it('lets a plan keep its own name on rename', () => {
    expect(renameActive(two, 'A').scenarios[0].name).toBe('A')
  })

  it('will not set a comparison against the active plan', () => {
    expect(setCompare(two, 'a').compareId).toBeNull()
  })
})
