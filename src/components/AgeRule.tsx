import { NumberField } from './NumberField'
import { SegmentedToggle } from './SegmentedToggle'

/**
 * When something about a pot takes effect.
 *
 * `open` is the no-restriction end — drawable any time, or paid into for as
 * long as the plan runs. `retirement` follows the owner's retirement age, so
 * it moves when that does. `age` is a figure of its own.
 */
export type AgeRuleMode = 'open' | 'retirement' | 'age'

interface AgeRuleProps {
  label: string
  /** What the no-restriction option is called here: "Any time", "Never". */
  openLabel: string
  mode: AgeRuleMode
  /** The age in force, used when `mode` is `age`. */
  age: number
  retirementAge: number
  /** Where `age` starts when someone picks "At an age" for the first time. */
  defaultAge: number
  min?: number
  max?: number
  hint?: string
  onChange: (mode: AgeRuleMode, age: number) => void
}

/**
 * Replaces a number field plus a "use my retirement age" checkbox.
 *
 * Two of those checkboxes used to sit in every pot card carrying the *same*
 * words — one governing when the pot unlocks, one when contributions stop —
 * which read as a repeat rather than two different questions. And "no limit"
 * was expressed by typing a sentinel age, which put an implementation detail
 * on screen as a number to be guessed at. Three named options say both
 * things outright.
 */
export function AgeRule({
  label,
  openLabel,
  mode,
  age,
  retirementAge,
  defaultAge,
  min = 0,
  max = 90,
  hint,
  onChange,
}: AgeRuleProps) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</p>
      <SegmentedToggle
        value={mode}
        ariaLabel={label}
        onChange={(next) => onChange(next, next === 'age' && mode !== 'age' ? defaultAge : age)}
        options={
          [
            ['open', openLabel],
            /*
             * Named, not numbered. Labelling it "At 60" made it look identical
             * to the option beside it with 60 typed in — when the difference
             * is that this one moves if the retirement age does.
             */
            [
              'retirement',
              'Retirement',
              `Follows the owner's retirement age, currently ${retirementAge}`,
            ],
            ['age', 'At an age'],
          ] as const
        }
      />
      {mode === 'age' && (
        <div className="mt-2">
          <NumberField
            label="Age"
            value={age}
            onChange={(v) => onChange('age', v)}
            min={min}
            max={max}
          />
        </div>
      )}
      {mode === 'retirement' && (
        <p className="mt-1 text-xs text-slate-400">
          Currently {retirementAge}, and moves with the retirement age.
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
