import {
  coerceAssumptions,
  defaultAssumptions,
  importAssumptions,
  loadAssumptions,
  newId,
} from './storage'
import type { Assumptions } from './types'

/**
 * A plan under a name. The planner used to hold exactly one, which made the
 * question it exists to answer — "what if I went at 58 instead?" — something
 * you could only ask by overwriting the answer you already had.
 */
export interface Scenario {
  id: string
  name: string
  assumptions: Assumptions
}

export interface ScenarioStore {
  scenarios: Scenario[]
  activeId: string
  /** The scenario the active one is measured against, or null for none. */
  compareId: string | null
}

const STORAGE_KEY = 'retirement-planner:scenarios:v1'

export const MAX_SCENARIOS = 8
const MAX_NAME = 40

function makeScenario(name: string, assumptions: Assumptions): Scenario {
  return { id: newId(), name, assumptions }
}

/** Trims, caps, and falls back — a scenario with a blank name is unpickable. */
export function cleanName(raw: string, fallback = 'Untitled plan'): string {
  const trimmed = raw.trim().slice(0, MAX_NAME)
  return trimmed.length > 0 ? trimmed : fallback
}

export function uniqueName(base: string, taken: readonly string[]): string {
  const clean = cleanName(base)
  if (!taken.includes(clean)) return clean
  for (let n = 2; n < 100; n++) {
    const candidate = cleanName(`${clean} ${n}`)
    if (!taken.includes(candidate)) return candidate
  }
  return cleanName(`${clean} ${newId().slice(0, 4)}`)
}

export function activeScenario(store: ScenarioStore): Scenario {
  return store.scenarios.find((s) => s.id === store.activeId) ?? store.scenarios[0]
}

export function compareScenario(store: ScenarioStore): Scenario | null {
  if (store.compareId === null || store.compareId === store.activeId) return null
  return store.scenarios.find((s) => s.id === store.compareId) ?? null
}

function singleScenarioStore(a: Assumptions, name = 'My plan'): ScenarioStore {
  const only = makeScenario(name, a)
  return { scenarios: [only], activeId: only.id, compareId: null }
}

export function defaultScenarioStore(): ScenarioStore {
  return singleScenarioStore(defaultAssumptions)
}

/**
 * Accepts anything and returns something usable. Every field is re-derived
 * rather than trusted: a store read back with a dangling `activeId` would
 * otherwise leave the app with no plan on screen and no way to pick one.
 */
export function coerceStore(raw: unknown): ScenarioStore {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return defaultScenarioStore()
  }
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record.scenarios)) return defaultScenarioStore()

  const taken: string[] = []
  const scenarios = record.scenarios.slice(0, MAX_SCENARIOS).map((entry, i) => {
    const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>
    const name = uniqueName(typeof e.name === 'string' ? e.name : `Plan ${i + 1}`, taken)
    taken.push(name)
    return {
      id: typeof e.id === 'string' && e.id.length > 0 ? e.id : newId(),
      name,
      assumptions: coerceAssumptions(e.assumptions),
    }
  })
  if (scenarios.length === 0) return defaultScenarioStore()

  // Ids have to be distinct or the pickers address the wrong plan.
  const seen = new Set<string>()
  for (const s of scenarios) {
    if (seen.has(s.id)) s.id = newId()
    seen.add(s.id)
  }

  const ids = scenarios.map((s) => s.id)
  const activeId = typeof record.activeId === 'string' && ids.includes(record.activeId)
    ? record.activeId
    : ids[0]
  const rawCompare = record.compareId
  const compareId =
    typeof rawCompare === 'string' && ids.includes(rawCompare) && rawCompare !== activeId
      ? rawCompare
      : null

  return { scenarios, activeId, compareId }
}

export function loadStore(): ScenarioStore {
  if (typeof window === 'undefined') return defaultScenarioStore()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return coerceStore(JSON.parse(raw))
  } catch {
    return defaultScenarioStore()
  }
  // No scenario store yet: carry over whatever single plan was saved before,
  // including the v1/v2 migrations `loadAssumptions` already knows about.
  const migrated = singleScenarioStore(loadAssumptions())
  saveStore(migrated)
  return migrated
}

export function saveStore(store: ScenarioStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works.
  }
}

export function clearStore(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — reset still clears what's on screen.
  }
}

// --- editing -------------------------------------------------------------

export function withActiveAssumptions(store: ScenarioStore, a: Assumptions): ScenarioStore {
  return {
    ...store,
    scenarios: store.scenarios.map((s) => (s.id === store.activeId ? { ...s, assumptions: a } : s)),
  }
}

export function addScenario(store: ScenarioStore, name: string, a: Assumptions): ScenarioStore {
  if (store.scenarios.length >= MAX_SCENARIOS) return store
  const created = makeScenario(uniqueName(name, store.scenarios.map((s) => s.name)), a)
  return { ...store, scenarios: [...store.scenarios, created], activeId: created.id }
}

export function duplicateActive(store: ScenarioStore): ScenarioStore {
  const current = activeScenario(store)
  const next = addScenario(store, `${current.name} copy`, current.assumptions)
  // A duplicate exists to be changed and measured against its original, so
  // point the comparison at the plan it came from rather than leaving it off.
  return next === store ? store : { ...next, compareId: current.id }
}

export function renameActive(store: ScenarioStore, name: string): ScenarioStore {
  const others = store.scenarios.filter((s) => s.id !== store.activeId).map((s) => s.name)
  const applied = uniqueName(name, others)
  return {
    ...store,
    scenarios: store.scenarios.map((s) => (s.id === store.activeId ? { ...s, name: applied } : s)),
  }
}

export function deleteActive(store: ScenarioStore): ScenarioStore {
  if (store.scenarios.length <= 1) return store
  const remaining = store.scenarios.filter((s) => s.id !== store.activeId)
  const activeId = remaining[0].id
  return {
    scenarios: remaining,
    activeId,
    compareId: store.compareId === store.activeId || store.compareId === activeId
      ? null
      : store.compareId,
  }
}

export function setActive(store: ScenarioStore, id: string): ScenarioStore {
  if (!store.scenarios.some((s) => s.id === id)) return store
  // Comparing a plan with itself draws every series twice.
  return { ...store, activeId: id, compareId: store.compareId === id ? null : store.compareId }
}

export function setCompare(store: ScenarioStore, id: string | null): ScenarioStore {
  if (id !== null && (id === store.activeId || !store.scenarios.some((s) => s.id === id))) {
    return { ...store, compareId: null }
  }
  return { ...store, compareId: id }
}

// --- backup --------------------------------------------------------------

export function exportStore(store: ScenarioStore): void {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `retirement-plan-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Reads a backup from this planner. Files exported before scenarios existed
 * hold a single plan at the top level, so those still open — as one scenario.
 */
export async function importStore(file: File): Promise<ScenarioStore> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't JSON. Pick a backup exported from this planner.")
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "That file doesn't look like a saved plan. Pick a backup exported from this planner.",
    )
  }
  if (Array.isArray((parsed as Record<string, unknown>).scenarios)) {
    const store = coerceStore(parsed)
    // Fresh ids, so importing a backup twice can't collide with what's here.
    const remapped = store.scenarios.map((s) => ({ ...s, id: newId() }))
    const activeIndex = store.scenarios.findIndex((s) => s.id === store.activeId)
    const compareIndex = store.scenarios.findIndex((s) => s.id === store.compareId)
    return {
      scenarios: remapped,
      activeId: remapped[activeIndex === -1 ? 0 : activeIndex].id,
      compareId: compareIndex === -1 ? null : remapped[compareIndex].id,
    }
  }
  return singleScenarioStore(await importAssumptions(file), 'Imported plan')
}
