import { formatCurrency } from '../lib/format'
import { makeProperty, newId } from '../lib/storage'
import { realRate } from '../lib/projection'
import { pensionSourceId } from '../lib/types'
import type { Person, Property, SavingsPot } from '../lib/types'
import { NumberField } from './NumberField'
import { PROPERTY_COLOR } from './chartColors'

interface PropertyEditorProps {
  properties: Property[]
  pots: SavingsPot[]
  people: Person[]
  inflationRate: number
  onChange: (properties: Property[]) => void
}

export function PropertyEditor({
  properties,
  pots,
  people,
  inflationRate,
  onChange,
}: PropertyEditorProps) {
  // Where released money can land. Identical to a one-off event's
  // destinations, because it is the same question: which pot takes it.
  const destinations = [
    ...pots.map((pot) => ({ id: pot.id, label: pot.name })),
    ...people
      .filter((person) => person.pensionType === 'dc')
      .map((person) => ({
        id: pensionSourceId(person.id),
        label: people.length > 1 ? `${person.name}: pension` : 'Pension',
      })),
  ]

  function update(id: string, patch: Partial<Property>) {
    onChange(properties.map((pr) => (pr.id === id ? { ...pr, ...patch } : pr)))
  }

  function add() {
    onChange([
      ...properties,
      makeProperty({
        id: newId(),
        name: properties.length === 0 ? 'Home' : `Property ${properties.length + 1}`,
        isMainHome: properties.length === 0,
        ownerId: people[0].id,
        proceedsTargetId: destinations[0]?.id ?? '',
      }),
    ])
  }

  return (
    <div className="space-y-3">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          people={people}
          destinations={destinations}
          inflationRate={inflationRate}
          onChange={(patch) => update(property.id, patch)}
          onRemove={() => onChange(properties.filter((pr) => pr.id !== property.id))}
        />
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-ink-400 hover:text-ink-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-ink-500 dark:hover:text-ink-400"
      >
        + Add property
      </button>
    </div>
  )
}

function PropertyCard({
  property,
  people,
  destinations,
  inflationRate,
  onChange,
  onRemove,
}: {
  property: Property
  people: Person[]
  destinations: { id: string; label: string }[]
  inflationRate: number
  onChange: (patch: Partial<Property>) => void
  onRemove: () => void
}) {
  const owner = people.find((p) => p.id === property.ownerId) ?? people[0]
  const equity = Math.max(0, property.value - property.mortgageBalance)
  const selling = property.sellAtAge !== null
  const downsizing = selling && property.replacementValue > 0
  const realGrowth = realRate(property.growthRate, inflationRate)
  const mortgageYears = Math.max(0, property.mortgageYearsRemaining)

  // What the sale would release today, before any growth. Enough to show the
  // shape of the decision — the projection does it properly, at the real age.
  const releasedNow = Math.max(
    0,
    property.value * (1 - property.sellingCostsPct / 100) -
      property.mortgageBalance -
      property.replacementValue,
  )

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-600">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: PROPERTY_COLOR }}
        />
        <input
          type="text"
          value={property.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="min-w-0 flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-slate-800 hover:border-slate-300 focus:border-ink-500 focus:outline-none dark:text-slate-100"
          aria-label="Property name"
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
          aria-label={`Remove ${property.name}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-4 gap-3">
        <NumberField
          label="Value today"
          value={property.value}
          onChange={(v) => onChange({ value: v })}
          prefix="£"
          step={5000}
        />
        <NumberField
          label="Growth"
          value={property.growthRate}
          onChange={(v) => onChange({ growthRate: v })}
          suffix="%"
          step={0.1}
          hint={`${(realGrowth * 100).toFixed(2)}% real`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-4 gap-3">
        <NumberField
          label="Mortgage left"
          value={property.mortgageBalance}
          onChange={(v) => onChange({ mortgageBalance: v })}
          prefix="£"
          step={1000}
        />
        <NumberField
          label="Years left"
          value={property.mortgageYearsRemaining}
          onChange={(v) => onChange({ mortgageYearsRemaining: v })}
          min={0}
          max={40}
        />
      </div>
      {mortgageYears > 0 && (
        <div className="mt-3">
          <NumberField
            label="Yearly mortgage payment"
            value={property.mortgageAnnualPayment}
            onChange={(v) => onChange({ mortgageAnnualPayment: v })}
            prefix="£"
            step={100}
            hint={`Paid off in ${new Date().getFullYear() + mortgageYears}.`}
          />
        </div>
      )}

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={selling}
          onChange={(e) =>
            onChange({ sellAtAge: e.target.checked ? owner.retirementAge : null })
          }
          className="h-4 w-4 rounded accent-ink-600"
        />
        Sell or downsize it
      </label>

      {selling && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-4 gap-3">
            <NumberField
              label={`At ${owner.name}'s age`}
              value={property.sellAtAge ?? owner.retirementAge}
              onChange={(v) => onChange({ sellAtAge: v })}
              min={owner.currentAge}
              max={owner.lifeExpectancy}
            />
            <NumberField
              label="Costs of selling"
              value={property.sellingCostsPct}
              onChange={(v) => onChange({ sellingCostsPct: v })}
              suffix="%"
              max={100}
              step={0.5}
              hint="Agent, legal, moving — and any tax on the gain."
            />
          </div>
          <NumberField
            label="Buying in its place"
            value={property.replacementValue}
            onChange={(v) => onChange({ replacementValue: v })}
            prefix="£"
            step={5000}
            hint="0 sells outright. A smaller figure than the value is a downsize — the difference is released."
          />
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Money released goes to
            </span>
            <select
              value={property.proceedsTargetId}
              onChange={(e) => onChange({ proceedsTargetId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {people.length > 1 && (
        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Sale age follows
          </span>
          <select
            value={property.ownerId}
            onChange={(e) => onChange({ ownerId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        <strong>{formatCurrency(equity)}</strong> of equity today.{' '}
        {selling ? (
          <>
            {downsizing ? 'Downsizing' : 'Selling'} at {property.sellAtAge} would release roughly{' '}
            <strong>{formatCurrency(releasedNow)}</strong> at today's value — the projection uses
            the value it has grown to by then.
          </>
        ) : (
          <>Kept for the whole plan, so none of it is ever spendable.</>
        )}
      </p>
    </div>
  )
}
