import type { ReactNode } from 'react'

interface PanelProps {
  /** Anchor, so a hero figure can scroll to whatever explains it. */
  id?: string
  /** Omit when the child renders its own heading. */
  title?: string
  description?: ReactNode
  /** A control that belongs to this panel — a mode toggle, a badge. */
  action?: ReactNode
  children: ReactNode
}

/**
 * The card every result block sits in. `print-block` is what keeps a chart and
 * its heading on one sheet; the print stylesheet looks for that class rather
 * than a structural selector, so panels can be nested freely.
 */
export function Panel({ id, title, description, action, children }: PanelProps) {
  return (
    <section
      id={id}
      className="print-block scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      {(title || action) && (
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {description && (
        <p className="mb-3 max-w-3xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {children}
    </section>
  )
}
