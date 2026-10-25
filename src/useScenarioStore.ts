import { useCallback, useEffect, useMemo, useReducer } from 'react'
import {
  activeScenario,
  compareScenario,
  deleteActive,
  duplicateActive,
  loadStore,
  renameActive,
  saveStore,
  setActive,
  setCompare,
  withActiveAssumptions,
  type Scenario,
  type ScenarioStore,
} from './lib/scenarios'
import type { Assumptions } from './lib/types'

/**
 * Consecutive edits this close together collapse into one history entry, so
 * undo steps back over "I typed 60000", not over each of the five keystrokes
 * that got there.
 */
const COALESCE_MS = 700
const MAX_HISTORY = 50

interface HistoryState {
  past: ScenarioStore[]
  present: ScenarioStore
  future: ScenarioStore[]
  /** When `present` was last committed, for the coalescing window above. */
  lastAt: number
}

type Action =
  | { type: 'commit'; next: ScenarioStore; coalesce: boolean; at: number }
  | { type: 'switch'; next: ScenarioStore }
  | { type: 'undo' }
  | { type: 'redo' }

function reduce(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'commit': {
      if (action.next === state.present) return state
      const coalesce =
        action.coalesce && state.past.length > 0 && action.at - state.lastAt < COALESCE_MS
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-MAX_HISTORY),
        present: action.next,
        future: [],
        lastAt: action.at,
      }
    }
    // Choosing which plan to look at is navigation, not an edit — putting it
    // in the history would make undo walk back through the tabs you opened.
    case 'switch':
      return { ...state, present: action.next }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, MAX_HISTORY),
        lastAt: 0,
      }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: next,
        future: rest,
        lastAt: 0,
      }
    }
  }
}

export interface ScenarioApi {
  store: ScenarioStore
  active: Scenario
  compare: Scenario | null
  /** Edits the active plan. Rapid changes coalesce into one undo step. */
  update: <K extends keyof Assumptions>(key: K, value: Assumptions[K]) => void
  /** Replaces the active plan wholesale — always its own undo step. */
  replaceAssumptions: (a: Assumptions) => void
  replaceStore: (store: ScenarioStore) => void
  switchTo: (id: string) => void
  compareWith: (id: string | null) => void
  duplicate: () => void
  rename: (name: string) => void
  remove: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useScenarioStore(): ScenarioApi {
  const [state, dispatch] = useReducer(reduce, undefined, () => ({
    past: [],
    present: loadStore(),
    future: [],
    lastAt: 0,
  }))

  const store = state.present
  useEffect(() => saveStore(store), [store])

  const commit = useCallback(
    (next: ScenarioStore, coalesce = false) =>
      dispatch({ type: 'commit', next, coalesce, at: Date.now() }),
    [],
  )

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  // A focused field has the browser's own undo, which is the one that should
  // win while you are still typing in it; ours covers everything else. The
  // header buttons work either way, so neither is the only route.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      if (key === 'y' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const active = activeScenario(store)

  return useMemo<ScenarioApi>(
    () => ({
      store,
      active,
      compare: compareScenario(store),
      update: (key, value) =>
        commit(withActiveAssumptions(store, { ...active.assumptions, [key]: value }), true),
      replaceAssumptions: (a) => commit(withActiveAssumptions(store, a)),
      replaceStore: (next) => commit(next),
      switchTo: (id) => dispatch({ type: 'switch', next: setActive(store, id) }),
      compareWith: (id) => dispatch({ type: 'switch', next: setCompare(store, id) }),
      duplicate: () => commit(duplicateActive(store)),
      rename: (name) => commit(renameActive(store, name)),
      remove: () => commit(deleteActive(store)),
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [store, active, commit, undo, redo, state.past.length, state.future.length],
  )
}
