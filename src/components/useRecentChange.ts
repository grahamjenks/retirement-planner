import { useEffect, useRef, useState } from 'react'

/**
 * The value from before the current burst of changes, for a few seconds after
 * the last one — so a figure can say how far it just moved.
 *
 * The anchor deliberately survives a whole burst rather than tracking the
 * previous render: dragging a slider changes the figure dozens of times, and a
 * delta against the last step would read as zero the entire way down.
 */
export function useRecentChange<T>(value: T, holdMs = 4000): T | undefined {
  const [anchor, setAnchor] = useState<T | undefined>(undefined)
  const previous = useRef(value)

  useEffect(() => {
    if (Object.is(previous.current, value)) return
    const before = previous.current
    previous.current = value
    setAnchor((current) => (current === undefined ? before : current))
    const timer = setTimeout(() => setAnchor(undefined), holdMs)
    return () => clearTimeout(timer)
  }, [value, holdMs])

  return anchor
}
