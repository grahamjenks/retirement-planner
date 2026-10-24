/**
 * Groups the result panels so you aren't scrolling past six charts to reach
 * one. Only the selected panel is mounted, which is also why `App` has to
 * mount every panel before printing.
 */
export function ResultTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly (readonly [T, string, number])[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Results"
      className="no-print -mb-px flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700"
    >
      {tabs.map(([id, label, count]) => {
        const selected = id === value
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={selected}
            aria-controls={`panel-${id}`}
            onClick={() => onChange(id)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              selected
                ? 'border-ink-600 text-slate-900 dark:border-ink-300 dark:text-slate-50'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100'
            }`}
          >
            {label}
            <span
              className={`ml-1.5 text-[11px] tabular-nums ${
                selected ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
