import { useEffect, useRef, useState } from 'react'
import type { Scenario } from '../lib/scenarios'

const button =
  'rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'

const select =
  'max-w-52 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

interface ScenarioBarProps {
  scenarios: Scenario[]
  activeId: string
  compareId: string | null
  canAdd: boolean
  onSwitch: (id: string) => void
  onCompare: (id: string | null) => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function ScenarioBar({
  scenarios,
  activeId,
  compareId,
  canAdd,
  onSwitch,
  onCompare,
  onRename,
  onDuplicate,
  onDelete,
}: ScenarioBarProps) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
  const others = scenarios.filter((s) => s.id !== activeId)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  function startRename() {
    setDraft(active.name)
    setRenaming(true)
  }

  function commitRename() {
    if (!renaming) return
    setRenaming(false)
    if (draft.trim() !== active.name) onRename(draft)
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-slate-200 px-4 py-2.5 dark:border-slate-700">
      <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        Plan
      </span>

      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setRenaming(false)
          }}
          aria-label="Plan name"
          className={select}
        />
      ) : (
        <select
          value={activeId}
          onChange={(e) => onSwitch(e.target.value)}
          aria-label="Plan being edited"
          className={select}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      <button type="button" onClick={startRename} className={button} disabled={renaming}>
        Rename
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className={button}
        disabled={!canAdd}
        title={
          canAdd
            ? 'Copy this plan, so you can change the copy and compare the two'
            : 'Delete a plan before adding another'
        }
      >
        Duplicate
      </button>
      <button
        type="button"
        onClick={onDelete}
        className={button}
        disabled={scenarios.length <= 1}
        title={scenarios.length <= 1 ? 'Your only plan' : `Delete ${active.name}`}
      >
        Delete
      </button>

      <span className="ml-auto flex items-center gap-2">
        <label
          htmlFor="scenario-compare"
          className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
        >
          Compare with
        </label>
        <select
          id="scenario-compare"
          value={compareId ?? ''}
          onChange={(e) => onCompare(e.target.value === '' ? null : e.target.value)}
          disabled={others.length === 0}
          className={`${select} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <option value="">Nothing</option>
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </span>
    </div>
  )
}
