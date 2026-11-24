import type { ReactNode } from 'react'
import { useId } from 'react'

export interface FigureColumn<T> {
  label: string
  /** Cell text for one row. Return '—' rather than an empty string. */
  value: (row: T) => string
}

interface ChartFigureProps<T> {
  /** What the chart shows, read before anything else. */
  title: string
  /**
   * The thing a sighted reader takes from the shape of it, in a sentence —
   * where it starts, where it peaks, where it ends, whether it runs out.
   */
  summary: string
  /** The rows behind the chart. Condense long runs before passing them. */
  rows: T[]
  columns: FigureColumn<T>[]
  children: ReactNode
}

/**
 * Wraps a chart so it is not simply missing for anyone not looking at it.
 *
 * recharts emits an SVG of positioned `<path>` elements with no text but the
 * axis ticks, so a screen reader reading the chart itself gets a stream of
 * bare numbers in painting order. That is worse than nothing, so the chart is
 * hidden from the accessibility tree and replaced by two things that carry
 * the same information: a sentence saying what the shape of it is, and the
 * figures themselves as a table.
 *
 * The table is visually hidden rather than absent, so it prints and copies
 * with the page and stays in the DOM for anyone searching it.
 */
export function ChartFigure<T>({
  title,
  summary,
  rows,
  columns,
  children,
}: ChartFigureProps<T>) {
  const captionId = useId()
  return (
    <figure className="m-0" aria-labelledby={captionId}>
      <figcaption id={captionId} className="sr-only">
        {title}. {summary}
      </figcaption>
      {/*
        The chart is decorative once the caption and table below say the same
        thing; leaving it in the tree only adds the stream of axis numbers.
      */}
      <div aria-hidden="true">{children}</div>
      {/*
        The wrapper, not the table, carries sr-only: `width: 1px` is only a
        minimum to the table layout algorithm, so a bare table keeps its full
        content box. Clipped either way, but a 1px div is the honest shape.
      */}
      {rows.length > 0 && (
        <div className="sr-only">
        <table>
          <caption>{title} — the figures behind the chart</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c, j) => {
                  const text = c.value(row)
                  // The first column identifies the row — the year or the
                  // factor — so it is a header, not data.
                  return j === 0 ? (
                    <th key={c.label} scope="row">
                      {text}
                    </th>
                  ) : (
                    <td key={c.label}>{text}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </figure>
  )
}
