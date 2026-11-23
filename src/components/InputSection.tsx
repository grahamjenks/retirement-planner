import { useState, type ReactNode } from 'react'

interface InputSectionProps {
  title: string
  /**
   * What is inside, in a line, shown while the section is shut.
   *
   * Most sections start shut, so without this the sidebar would be nine
   * closed drawers and no way to tell which one holds the figure you came
   * to change.
   */
  summary?: ReactNode
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

export function InputSection({
  title,
  summary,
  icon,
  defaultOpen = true,
  children,
}: InputSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {icon}
            {title}
          </span>
          {!open && summary && (
            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
              {summary}
            </span>
          )}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="space-y-4 px-4 pb-5">{children}</div>}
    </div>
  )
}
