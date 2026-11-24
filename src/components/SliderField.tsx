interface SliderFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
  hint?: string
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  suffix = '%',
  hint,
}: SliderFieldProps) {
  return (
    // A slider wants more travel than a number box, for precision — but not
    // the full width of a stacked sidebar, where the thumb ends up a hand's
    // width from the figure it sets.
    <label className="block max-w-md">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-sm font-semibold text-ink-600 dark:text-ink-400">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        className="mt-2 w-full cursor-pointer"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </label>
  )
}
